/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import {
    VmCodeBuilder,
    ByteBuffer,
} from "./vm_code_builder.ts";
import Vm from "./vm.ts";
import {Dictionary} from "../util/mod.ts";

export enum FFI {
    Sys_exit,
    Sys_println,
    Sys_u64_println,
}

export const ForeignFunctions: Dictionary<number> = {
    "sys-exit": FFI.Sys_exit,
    "sys-println": FFI.Sys_println,
    "sys-u64-println": FFI.Sys_u64_println,
}

export const registers: Dictionary<number> = {
    "r0": 0,
    "r1": 1,
    "r2": 2,
    "r3": 3,
    "r4": 4,
    "r5": 5,
    "r6": 6,
    "r7": 7,
    "r8": 8,
    "r9": 9,
    "r10": 10,
    "r11": 11,
    "r12": 12,
    "r13": 13,
    "r14": 14,
    "r15": 15,
};

export {
    VmCodeBuilder,
    ByteBuffer,
    Vm,
}