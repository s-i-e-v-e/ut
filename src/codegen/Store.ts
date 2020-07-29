/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import {
    P
} from "../parser/mod.ts";
import {VmCodeBuilder} from "../vm/vm_code_builder.ts";
import {Registers} from "./Registers.ts";
import {
    Dictionary,
    Errors,
} from "../util/mod.ts";
const KnownTypes = P.KnownTypes;

type Free = (id: string) => void;

export abstract class Store {
    public isWrite = true;
    public isValue = true;
    public isRHS = false;
    protected constructor(public readonly v: P.Variable) {}

    abstract write_imm(b: VmCodeBuilder, n: bigint): void;
    abstract write_str(b: VmCodeBuilder, s: string): void;
    abstract write_reg(b: VmCodeBuilder, rm: Store): void;
    abstract write_deref(b: VmCodeBuilder, rm: Store): void;
    abstract write_reg_to_deref(b: VmCodeBuilder, rm: Store): void;
    abstract free(): void;
}

class Register extends Store {
    constructor(
        public readonly v: P.Variable,
        public readonly reg: string,
        private readonly f: Free,
    ) {
        super(v);
    }

    write_imm(b: VmCodeBuilder, n: bigint) {
        b.mov_r_i(this.reg, n);
    }

    write_str(b: VmCodeBuilder, s: string) {
        b.mov_r_str(this.reg, s);
    }

    write_reg(b: VmCodeBuilder, rm: Store) {
        const r = rm as Register;
        b.mov_r_r(this.reg, r.reg);
    }

    write_deref(b: VmCodeBuilder, rm: Store) {
        const r = rm as Register;
        b.mov_r_ro(this.reg, r.reg);
    }

    write_reg_to_deref(b: VmCodeBuilder, rm: Store) {
        const r = rm as Register;
        b.mov_ro_r(this.reg, r.reg);
    }

    free() {
        this.f(this.reg);
    }
}

class Memory extends Store {
    constructor(public readonly v: P.Variable) {
        super(v);
    }

    write_imm(b: VmCodeBuilder, n: bigint) {
        Errors.raiseDebug();
    }

    write_str(b: VmCodeBuilder, s: string) {
        Errors.raiseDebug();
    }

    write_reg(b: VmCodeBuilder, rm: Store) {
        Errors.raiseDebug();
    }

    write_deref(b: VmCodeBuilder, rm: Store) {
        Errors.raiseDebug();
    }

    write_reg_to_deref(b: VmCodeBuilder, rm: Store) {
        Errors.raiseDebug();
    }

    free() {
        Errors.raiseDebug();
    }
}

export class Allocator {
    private readonly regs: Registers;
    private readonly map: Dictionary<Store>;
    private static index = 0;
    private static readonly loc = {
        line: 1,
        character: 1,
        index: 1,
        path: "<mem>",
    };

    private constructor() {
        this.regs = Registers.build();
        this.map = {};
    }

    alloc(v: P.Variable) {
        const x = this._build(v, this.regs);
        this.map[v.id] = x;
        return x;
    }

    _build(v: P.Variable, regs: Registers) {
        switch (v.type.id) {
            case KnownTypes.Array.id:
            case KnownTypes.String.id:
            case KnownTypes.Bool.id:
            case KnownTypes.Integer.id:
            case KnownTypes.Pointer.id: {
                const self = this;
                return new Register(v, regs.useReg(v.id), (reg: string) => self.free(reg));
            }
            /*case KnownTypes.Array.id:
            case KnownTypes.String.id: {
                return new Memory(v);
            }*/
            default: Errors.raiseDebug(v.type.id);
        }
    }

    get(id: string) {
        if (!this.map[id]) Errors.raiseDebug();
        return this.map[id];
    }

    free(reg: string) {
        this.regs.freeReg(reg);
    }

    tmp() {
        const v = {
            id: `t${Allocator.index}`,
            isMutable: true,
            loc: Allocator.loc,
            type: KnownTypes.NotInferred,
        }
        Allocator.index += 1;
        const self = this;
        return new Register(v, this.regs.useReg(), (reg: string) => self.free(reg));
    }

    from(reg: string) {
        const v = {
            id: reg,
            isMutable: true,
            loc: Allocator.loc,
            type: KnownTypes.NotInferred,
        }
        return new Register(v, reg, (reg: string) => {});
    }

    save(b: VmCodeBuilder) {
        return this.regs.save(b);
    }

    restore(b: VmCodeBuilder, saved: string[]) {
        this.regs.restore(b, saved);
    }

    static build() {
        return new Allocator();
    }
}