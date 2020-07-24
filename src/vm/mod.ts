/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import VmByteCode from "./vm_bytecode_emitter.ts";
import Vm from "./vm.ts";
import {Dictionary} from "../util/mod.ts";

export enum FFI {
    Sys_exit,
    Sys_println,
}

export const ForeignFunctions: Dictionary<number> = {
    "sys-exit": FFI.Sys_exit,
    "sys-println": FFI.Sys_println,
}

export {
    VmByteCode,
    Vm,
}