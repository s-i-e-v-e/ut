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
    private static readonly loc = {
        line: 1,
        character: 1,
        index: 1,
        path: "<mem>",
    };

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

    alloc(v: P.Variable) {
        let x: Register;
        switch (v.type.id) {
            case KnownTypes.Array.id:
            case KnownTypes.String.id:
            case KnownTypes.Bool.id:
            case KnownTypes.Integer.id:
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
        const v = {
            id: `t${Allocator.index}`,
            isMutable: true,
            loc: Allocator.loc,
            type: KnownTypes.NotInferred,
        }
        Allocator.index += 1;
        const self = this;
        return new Register(this.b, v, this.use(), (reg: string) => self.free(reg));
    }

    from(reg: string) {
        const v = {
            id: reg,
            isMutable: true,
            loc: Allocator.loc,
            type: KnownTypes.NotInferred,
        }
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