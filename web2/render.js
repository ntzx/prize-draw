(function() {

class LayoutBuilder {
    constructor({ itemWidth, itemHeight }) {
        this.layout = [];
        this.itemWidth = itemWidth;
        this.itemHeight = itemHeight;
    }

    addRow({ n_cols, center_y }) {
        let cw = document.body.clientWidth;
        let interval = cw / (n_cols + 1);

        for(let i = 0; i < n_cols; i++) {
            this.layout.push({
                center_x: Math.floor(interval * (i + 1)),
                center_y: center_y,
                width: this.itemWidth,
                height: this.itemHeight
            });
        }

        return this;
    }

    build() {
        return this.layout;
    }
}

class Session {
    // layout (array):
    // - center_x
    // - center_y
    // - width
    // - height
    constructor({ container, layout, people }) {
        let config = {
            batch_size: layout.length,
            people: people
        };
        let config_ptr = window.bridge.buildLocalString(JSON.stringify(config));
        this.feed = window.bridge.instance.exports.fs_create(config_ptr);
        window.bridge.dealloc(config_ptr);

        if(!this.feed) {
            throw new Error("Unable to create feed source");
        }

        this.current = null;

        this.container = container;
        container.innerHTML = "";
        this.elements = layout.map(item => {
            let elem = document.createElement("div");
            elem.className = "pic-blk";
            elem.style.backgroundSize = "cover";
            elem.style.width = item.width + "px";
            elem.style.height = item.height + "px";
            elem.style.position = "fixed";
            elem.style.top = (item.center_y - item.height / 2) + "px";
            elem.style.left = (item.center_x - item.width / 2) + "px";
            container.appendChild(elem);
            return elem;
        });
    }

    preloadFromList(preloadList) {
        /*for(const src of preloadList) {
            let img = new Image();
            img.src = src;
        }*/
    }

    destroy() {
        window.bridge.instance.exports.fs_destroy(this.feed);
        this.feed = null;
        this.container.innerHTML = "";
    }

    update_once() {
        let tick_ptr = window.bridge.instance.exports.fs_tick(this.feed);
        let tick_raw = window.bridge.readString(tick_ptr);
        window.bridge.deallocRemoteString(tick_ptr);

        let tick = JSON.parse(tick_raw);
        console.log(tick);

        this.preloadFromList(tick.preload_images);

        if(tick.current.length != this.elements.length) {
            throw new Error("Tick length mismatch");
        }

        for(let i = 0; i < tick.current.length; i++) {
            this.elements[i].style.backgroundImage = "url(" + tick.current[i].avatar + ")";
        }

        this.current = tick.current;
    }

    complete() {
        for(let i = 0; i < this.current.length; i++) {
            let label = document.createElement("div");
            label.className = "person-label";
            label.innerText = this.current[i].studentId + " / " + this.current[i].studentName;
            this.elements[i].appendChild(label);
        }
    }
}

let container;
let session = null;
let people;
let shouldStop = false;
let running = false;
let preloadHandles = [];

async function preloadAll() {
    let preloadPromises = people.map(p => new Promise((resolve, reject) => {
        let img = new Image();
        img.onload = () => {
            preloadHandles.push(img);
            resolve();
        };
        img.onerror = (self, e) => {
            reject(e);
        };
        img.src = p.avatar;
    }));
    await Promise.all(preloadPromises);
}

async function resetSession(layout) {
    if(session) {
        session.destroy();
        session = null;
    }
    session = new Session({
        container: container,
        layout: layout,
        people: people
    });
}

async function updateView() {
    if(shouldStop) {
        session.complete();
        shouldStop = false;
        running = false;
        return;
    }

    running = true;

    session.update_once();
    setTimeout(() => {
        updateView();
    }, 100);
}

function printSeed() {
    let rseed_ptr = window.bridge.instance.exports.get_printable_rseed();
    let rseed = window.bridge.readString(rseed_ptr);
    window.bridge.deallocRemoteString(rseed_ptr);

    document.getElementById("rseed").innerText = rseed.trim();
}

async function run() {
    await window.bridge.init();

    people = JSON.parse(await (await fetch("people.stage1.json")).text());
    await preloadAll();
    console.log("preloaded");

    printSeed();

    container = document.getElementById("container");

    window.addEventListener("keyup", ev => {
        switch(ev.keyCode) {
            case 49: // '1'
                if(running) break;
                resetSession(
                    new LayoutBuilder({
                        itemWidth: 200,
                        itemHeight: 300
                    })
                    .addRow({ n_cols: 5, center_y: 200 })
                    .addRow({ n_cols: 5, center_y: 550 })
                    .build()
                );
                updateView();
                break;
            case 50: // '2'
                if(running) break;
                resetSession(
                    new LayoutBuilder({
                        itemWidth: 200,
                        itemHeight: 300
                    })
                    .addRow({ n_cols: 5, center_y: 200 })
                    .addRow({ n_cols: 4, center_y: 550 })
                    .build()
                );
                updateView();
                break;
            case 51: // '3'
                if(running) break;
                resetSession(
                    new LayoutBuilder({
                        itemWidth: 400,
                        itemHeight: 600
                    })
                    .addRow({ n_cols: 1, center_y: 375 })
                    .build()
                );
                updateView();
                break;
            case 32: // ' '
                if(running) {
                    shouldStop = true;
                }
                break;
            default:
                break;
        }
    })
/*
    resetSession(new LayoutBuilder({
        itemWidth: 320,
        itemHeight: 240
    })
    .addRow({ n_cols: 3, center_y: 150 })
    .addRow({ n_cols: 2, center_y: 300 })
    .build())

    updateView();*/
}

window.addEventListener("load", run);

})();
