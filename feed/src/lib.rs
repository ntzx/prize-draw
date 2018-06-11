extern crate serde;
#[macro_use]
extern crate serde_derive;
extern crate serde_json;
extern crate rand;
#[macro_use]
extern crate lazy_static;

pub mod glue;

use std::sync::Mutex;
use std::collections::VecDeque;
use std::os::raw::c_char;
use std::rc::Rc;
use rand::ChaChaRng;
use rand::SeedableRng;
use rand::Rng;

extern "C" {
    #[link_name = "random"]
    fn __random() -> f64;
}

lazy_static! {
    static ref RNG: Mutex<ChaChaRng> = Mutex::new(ChaChaRng::from_seed({
        let mut bytes: [u8; 32] = [0u8; 32];
        for i in 0..32 {
            bytes[i] = (random() * 256f64) as u8;
        }
        bytes
    }));
}

fn random() -> f64 {
    unsafe { __random() }
}

pub struct FeedSource {
    people: VecDeque<Rc<Profile>>,
    ready_queue: VecDeque<Rc<Profile>>,
    batch_size: usize
}

#[derive(Clone, Deserialize)]
pub struct Config {
    people: Vec<Profile>,
    batch_size: usize
}

#[derive(Clone, Serialize, Deserialize)]
pub struct Profile {
    avatar: String,
    #[serde(rename = "studentId")]
    student_id: Option<String>,
    #[serde(rename = "studentName")]
    student_name: Option<String>
}

#[derive(Clone, Serialize)]
pub struct Tick<'a> {
    current: Vec<&'a Profile>,
    preload_images: Vec<&'a str>
}

impl FeedSource {
    pub fn from_config(mut config: Config) -> FeedSource {
        RNG.lock().unwrap().shuffle(&mut config.people);
        let mut fs = FeedSource {
            people: config.people.into_iter().map(|x| Rc::new(x)).collect(),
            ready_queue: VecDeque::new(),
            batch_size: config.batch_size
        };
        fs.fill_ready_queue();
        fs
    }

    fn pick_one(&mut self) -> Rc<Profile> {
        loop {
            let current = self.people.pop_front().unwrap();
            self.people.push_back(current.clone());

            if random() < 0.3 {
                return current;
            }
        }
    }

    pub fn fill_ready_queue(&mut self) -> Vec<Rc<Profile>> {
        let mut newly_added = Vec::new();

        while self.ready_queue.len() < self.batch_size * 30 {
            let pf = self.pick_one();
            self.ready_queue.push_back(pf.clone());
            newly_added.push(pf);
        }

        newly_added
    }
}

#[no_mangle]
pub extern "C" fn fs_create(cfg: *const c_char) -> *mut FeedSource {
    use std::ffi::CStr;

    let cfg: Config = match ::serde_json::from_str(
        unsafe { CStr::from_ptr(cfg) }.to_str().unwrap()
    ) {
        Ok(v) => v,
        Err(_) => return ::std::ptr::null_mut()
    };

    Box::into_raw(Box::new(FeedSource::from_config(cfg)))
}

#[no_mangle]
pub unsafe extern "C" fn fs_destroy(fs: *mut FeedSource) {
    Box::from_raw(fs);
}

#[no_mangle]
pub extern "C" fn fs_preload_all(fs: &FeedSource) -> *mut c_char {
    use std::ffi::CString;

    let ready_queue: Vec<&str> = fs.ready_queue.iter().map(|x| x.avatar.as_str()).collect();
    CString::new(
        ::serde_json::to_string(&ready_queue).unwrap()
    ).unwrap().into_raw()
}

#[no_mangle]
pub extern "C" fn fs_tick(fs: &mut FeedSource) -> *mut c_char {
    use std::ffi::CString;

    let rq: Vec<Rc<Profile>> = (0..fs.batch_size)
        .map(|_| fs.ready_queue.pop_front())
        .filter(|x| x.is_some())
        .map(|x| x.unwrap())
        .collect();

    let newly_added = fs.fill_ready_queue();

    let tick = Tick {
        current: rq.iter().map(|x| &**x).collect(),
        preload_images: newly_added.iter().map(|x| x.avatar.as_str()).collect()
    };

    CString::new(
        ::serde_json::to_string(&tick).unwrap()
    ).unwrap().into_raw()
}
