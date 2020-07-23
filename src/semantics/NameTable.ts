/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import {
    Dictionary,
    Errors,
} from "../util/mod.ts";

export default class NameTable {
    private readonly map: Dictionary<string[]>;

    private constructor() {
        this.map = {};
    }

    get(id: string) {
        if (!this.map[id]) throw Errors.raiseDebug();
        const xs = this.map[id];
        return `${id}-${xs.length-1}`;
    }

    add(id: string) {
        if (!this.map[id]) {
            this.map[id] = [];
        }
        const xs = this.map[id];
        const name = `${id}-${xs.length}`;
        xs.push(name);
        return name;
    }

    toConsole() {
        Object.keys(this.map).forEach(k => {
            console.log(`${k} => ${this.map[k]}`);
        })
    }

    static build() {
        return new NameTable();
    }
}