(function() {

async function init() {
    let codeStream = await fetch("feed.wasm");
    let code = await codeStream.arrayBuffer();
    let wModule = await WebAssembly.compile(code);
    let wInstance = await WebAssembly.instantiate(
        wModule,
        {
            env: {
                rand_seed: (ptr, len) => {
                    let buf = new Uint8Array(len);
                    window.crypto.getRandomValues(buf);
                    writeMemory(ptr, buf, len);
                }
            }
        }
    );

    window.bridge.instance = wInstance;
}

function alloc(len) {
    return window.bridge.instance.exports.g_alloc(len);
}

function dealloc(ptr) {
    window.bridge.instance.exports.g_free(ptr);
}

function deallocRemoteString(ptr) {
    window.bridge.instance.exports.g_destroy_cstring(ptr);
}

function buildLocalString(s) {
    let encoder = new TextEncoder();
    let raw = encoder.encode(s);
    let mem = alloc(raw.length + 1);
    writeMemory(mem, raw, raw.length);
    writeMemory(mem + raw.length, [0], 1);
    return mem;
}

function writeMemory(ptr, data, len) {
    let arrayView = new Uint8Array(window.bridge.instance.exports.memory.buffer);
    for(let i = 0; i < len; i++) {
        arrayView[ptr + i] = data[i];
    }
}

function readString(ptr, len = 0) {
    let arrayView = new Uint8Array(window.bridge.instance.exports.memory.buffer);
    if(!len) {
        len = 0;
        let p = ptr;
        while(arrayView[p]) {
            p++;
            len++;
        }
    }

    let result = new Uint8Array(len);
    for(let i = 0; i < len; i++) {
        result[i] = arrayView[ptr + i];
    }
    let decoder = new TextDecoder();
    return decoder.decode(result);
}

window.bridge = {
    init: init,
    alloc: alloc,
    dealloc: dealloc,
    deallocRemoteString: deallocRemoteString,
    buildLocalString: buildLocalString,
    writeMemory: writeMemory,
    readString: readString,
    instance: null
};

})();
