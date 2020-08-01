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
import {StructState} from "./mod.ts";
const KnownTypes = P.KnownTypes;
const NativeTypes = P.NativeTypes;

type Free = (id: string) => void;

export abstract class Store {
    public isWrite = true;
    public isValue = true;
    public isRHS = false;
    protected constructor(
        public readonly b: VmCodeBuilder,
        public readonly v: P.Variable,
        public isRegister: boolean,
        public isMemory: boolean,
    ) {}

    abstract write_imm(n: bigint): void;
    abstract write_str(s: string): void;
    abstract write_reg(rm: Store): void;
    abstract write_deref(rm: Store): void;
    abstract write_reg_to_deref(rm: Store): void;
    abstract free(): void;
    abstract memory(): Memory;
    abstract register(): Register;
}

class Register extends Store {
    constructor(
        public readonly b: VmCodeBuilder,
        public readonly v: P.Variable,
        public readonly reg: string,
        private readonly f: Free,
    ) {
        super(b, v, true, false);
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

    memory(): Memory {
        return Errors.raiseDebug();
    }

    register(): Register {
        return this as Register;
    }
}

class Memory extends Store {
    constructor(
        public readonly b: VmCodeBuilder,
        public readonly v: P.Variable,
        public readonly reg: string,
        private readonly f: Free,
        public readonly ss: StructState,
    ) {
        super(b, v, false, true);
    }

    write_imm(n: bigint) {
        Errors.raiseDebug();
    }

    write_str(s: string) {
        Errors.raiseDebug();
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
        Errors.raiseDebug();
    }

    free() {
        Errors.raiseDebug();
    }

    memory(): Memory {
        return this;
    }

    register(): Register {
        return Errors.raiseDebug();
    }
}

export class Allocator {
    private readonly map: Dictionary<Store>;
    private static index = 0;

    private constructor(public readonly b: VmCodeBuilder, private readonly regs: Dictionary<boolean>, public readonly parent?: Allocator) {
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

    alloc(v: P.Variable, ss?: StructState) {
        let x: Store;
        switch (v.type.id) {
            case NativeTypes.Array.id:
            case KnownTypes.SignedInt.id:
            case KnownTypes.UnsignedInt.id:
            case KnownTypes.Uint8.id: {
                const self = this;
                x = new Register(this.b, v, this.use(), (reg: string) => self.free(reg));
                break;
            }
            default: {
                if (v.type.native.bits !== 0) Errors.raiseDebug();
                const self = this;
                x = new Memory(this.b, v, this.use(), (reg: string) => self.free(reg), ss!);
            }
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
            P.UnknownLoc,
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
            P.UnknownLoc,
        );
        return new Register(this.b, v, reg, (reg: string) => {});
    }

    newAllocator() {
        return Allocator.build(this.b, this.regs, this);
    }

    static build(b: VmCodeBuilder, regs?: Dictionary<boolean>, parent?: Allocator) {
        regs = regs || {};
        return new Allocator(b, regs, parent);
    }
}