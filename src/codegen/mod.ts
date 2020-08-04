/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import vm_gen_code from "./vm_gen_code.ts";
import {
    Store,
    Allocator,
} from "./Allocator.ts";
import {Dictionary} from "../util/mod.ts";

export interface StructMember {
    offset: number;
    size: number;
}

export interface StructState {
    map: Dictionary<number>;
    xs: StructMember[];
    index: number; // nth member of struct
    offset: number;
}

export {
    vm_gen_code,
    Store,
    Allocator,
};

export function newStructState(): StructState {
    return {
        map: {},
        xs: [],
        index: 0,
        offset: 0,
    };
}