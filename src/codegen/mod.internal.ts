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

export enum VmType {
    Register,
    Reference,
}

export enum VmOpType {
    RegAlloc,
    MovIntegerLiteral,
    MovStringLiteral,
    MovR2R,
    Call,
}

export class VmState {
    private readonly registers: Dictionary<string|undefined>;
    private index: number;
    private indexTmp: number;
    private constructor() {
        this.registers = {};
        this.index = 0;
        this.indexTmp = 0;
    }

    useTempReg() {
        const reg = `t${this.indexTmp}`;
        this.registers[reg] = reg;
        this.indexTmp += 1;
        return reg;
    }

    useReg(id: string) {
        const reg = `r${this.index}`;
        this.registers[id] = reg;
        this.index += 1;
        return reg;
    }

    getReg(id: string) {
        if (!this.registers[id]) Errors.raiseDebug(id);
        return this.registers[id]!;
    }

    static build() {
        return new VmState();
    }
}

export interface VmVariable {
    id: string;
    type: VmType
}

export type VmParameter = VmVariable;

export interface VmOperation {
    opType: VmOpType,
}

export interface MovX2R extends VmOperation {
    rd: string,
}

export interface MovIntegerLiteral extends MovX2R {
    source: BigInt,
}

export interface MovStringLiteral extends MovX2R {
    source: string,
}

export interface MovR2R extends MovX2R {
    rs: string,
}

export interface Call extends VmOperation {
    id: string,
    args: string[],
}

export interface VmFunctionPrototype {
    id: string;
    params: VmParameter[];
    returnType: VmType;
}

export interface VmForeignFunction {
    proto: VmFunctionPrototype,
}

export interface VmFunction {
    proto: VmFunctionPrototype,
    body: VmOperation[];
}

export interface VmProgram {
    functions: VmFunction[];
    foreignFunctions: VmForeignFunction[];
}