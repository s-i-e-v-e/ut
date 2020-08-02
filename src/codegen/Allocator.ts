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
import {
    StructState,
    newStructState,
} from "./mod.ts";

type Free = (id: string) => void;

export class Store {
    public isWrite = true;
    public isValue = true;
    public isRHS = false;

    constructor(
        public readonly b: VmCodeBuilder,
        public readonly v: P.Variable,
        public readonly reg: string,
        private readonly f: Free,
        public readonly ss: StructState,
    ) {}

    write_imm(n: bigint) {
        this.b.mov_r_i(this.reg, n);
    }

    write_imm_str(str: string) {
        this.b.mov_r_str(this.reg, str);
    }

    write_reg(s: Store) {
        this.b.mov_r_r(this.reg, s.reg);
    }

    write_from_mem(s: Store) {
        this.b.mov_r_ro(this.reg, s.reg);
    }

    write_to_mem(s: Store) {
        this.b.mov_ro_r(this.reg, s.reg);
    }

    free() {
        this.f(this.reg);
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
        const self = this;
        let x = new Store(this.b, v, this.use(), (reg: string) => self.free(reg), ss || newStructState());
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
        const v = P.Types.buildVar(
            `t${Allocator.index}`,
            P.Types.Compiler.NotInferred,
            true,
            false,
            false,
            P.UnknownLoc,
        );
        Allocator.index += 1;
        const self = this;
        return new Store(this.b, v, this.use(), (reg: string) => self.free(reg), newStructState());
    }

    from(reg: string) {
        const v = P.Types.buildVar(
            reg,
            P.Types.Compiler.NotInferred,
            true,
            false,
            false,
            P.UnknownLoc,
        );
        return new Store(this.b, v, reg, (reg: string) => {}, newStructState());
    }

    newAllocator() {
        return Allocator.build(this.b, this.regs, this);
    }

    static build(b: VmCodeBuilder, regs?: Dictionary<boolean>, parent?: Allocator) {
        regs = regs || {};
        return new Allocator(b, regs, parent);
    }
}