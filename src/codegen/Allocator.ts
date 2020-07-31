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
import {
    Dictionary,
    Errors,
    Logger,
} from "../util/mod.ts";
import {registers} from "../vm/mod.ts";
const KnownTypes = P.KnownTypes;
const NativeTypes = P.NativeTypes;

type Free = (id: string) => void;

export abstract class Store {
    public isWrite = true;
    public isValue = true;
    public isRHS = false;
    protected constructor(public readonly b: VmCodeBuilder, public readonly v: P.Variable) {}

    abstract write_imm(n: bigint): void;
    abstract write_str(s: string): void;
    abstract write_reg(rm: Store): void;
    abstract write_deref(rm: Store): void;
    abstract write_reg_to_deref(rm: Store): void;
    abstract free(): void;
}

class Register extends Store {
    constructor(
        public readonly b: VmCodeBuilder,
        public readonly v: P.Variable,
        public readonly reg: string,
        private readonly f: Free,
    ) {
        super(b, v);
    }

    write_imm(n: bigint) {
        this.b.mov_r_i(this.reg, n);
    }

    write_str(s: string) {
        this.b.mov_r_str(this.reg, s);
    }

    write_reg(rm: Store) {
        const r = rm as Register;
        this.b.mov_r_r(this.reg, r.reg);
    }

    write_deref(rm: Store) {
        const r = rm as Register;
        this.b.mov_r_ro(this.reg, r.reg);
    }

    write_reg_to_deref(rm: Store) {
        const r = rm as Register;
        this.b.mov_ro_r(this.reg, r.reg);
    }

    free() {
        this.f(this.reg);
    }
}

class Memory extends Store {
    constructor(
        public readonly b: VmCodeBuilder,
        public readonly v: P.Variable,
    ) {
        super(b, v);
    }

    write_imm(n: bigint) {
        Errors.raiseDebug();
    }

    write_str(s: string) {
        Errors.raiseDebug();
    }

    write_reg(rm: Store) {
        Errors.raiseDebug();
    }

    write_deref(rm: Store) {
        Errors.raiseDebug();
    }

    write_reg_to_deref(rm: Store) {
        Errors.raiseDebug();
    }

    free() {
        Errors.raiseDebug();
    }
}

export class Allocator {
    private readonly map: Dictionary<Store>;
    private static index = 0;

    private constructor(public readonly b: VmCodeBuilder, private readonly types: Dictionary<P.Type>, private readonly regs: Dictionary<boolean>, public readonly parent?: Allocator) {
        this.map = {};
    }

    private use() {
        for (const r of Object.keys(registers)) {
            if (!this.regs[r]) {
                this.regs[r] = true;
                Logger.debug2(`use-reg: ${r}`);
                Logger.debug2(`${this.regs[r]} <-> ${r}`);
                return r;
            }
        }
        return Errors.raiseDebug("no free regs");
    }

    free(r: string) {
        this.regs[r] = false;
        Logger.debug2(`free-reg: ${r}`);
    }

    save() {
        const xs = [];
        for (const r of Object.keys(registers)) {
            if (r !== "r0" && this.regs[r] !== undefined) {
                this.b.push_r(r);
                xs.push(r);
            }
        }
        return xs;
    }

    restore(xs: string[]) {
        xs = xs.reverse();

        for (const r of xs) {
            this.b.pop_r(r);
        }
    }

    getType(t: P.Type) {
        return this.types[t.id];
    }

    alloc(v: P.Variable) {
        let x: Register;
        switch (v.type.id) {
            case NativeTypes.Array.id:
            case KnownTypes.Integer.id:
            case KnownTypes.String.id:
            case KnownTypes.Bool.id:
            case KnownTypes.Pointer.id: {
                const self = this;
                x = new Register(this.b, v, this.use(), (reg: string) => self.free(reg));
                break;
            }
            default: Errors.raiseDebug(v.type.id);
        }
        this.map[v.id] = x;
        return x;
    }

    get(id: string) {
        let table: Allocator|undefined = this;
        while (table) {
            const x = table.map[id];
            if (x) return x;
            table = table.parent || undefined;
        }
        Errors.raiseDebug();
    }

    tmp() {
        const v = P.buildVar(
            `t${Allocator.index}`,
            KnownTypes.NotInferred,
            true,
            false,
            false,
        );
        Allocator.index += 1;
        const self = this;
        return new Register(this.b, v, this.use(), (reg: string) => self.free(reg));
    }

    from(reg: string) {
        const v = P.buildVar(
            reg,
            KnownTypes.NotInferred,
            true,
            false,
            false,
        );
        return new Register(this.b, v, reg, (reg: string) => {});
    }

    newAllocator() {
        return Allocator.build(this.b, this.types, this.regs, this);
    }

    debug(t: P.Type) {
        const ty = this.types[t.id];
        if (ty.native && (ty.native as P.NativeType).bits) {
            Logger.debug(`type: ${ty.id}, native: ${ty.native.id}, bits: ${(ty.native as P.NativeType).bits}`);
        }
    }

    static build(b: VmCodeBuilder, types: Dictionary<P.Type>, regs?: Dictionary<boolean>, parent?: Allocator) {
        regs = regs || {};
        return new Allocator(b, types, regs, parent);
    }
}