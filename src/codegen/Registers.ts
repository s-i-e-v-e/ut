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
    Logger,
} from "../util/mod.ts";
import {
    registers,
    VmCodeBuilder,
} from "../vm/mod.ts";

export class Registers {
    private static REG_MAX = 15;
    private readonly idRegisters: Dictionary<string|undefined>;
    private readonly registerIDs: Dictionary<string|undefined>;

    private constructor() {
        this.idRegisters = {};
        this.registerIDs = {};
    }

    useReg(id?: string) {
        for (const r of Object.keys(registers)) {
            if (this.registerIDs[r] === undefined) {
                this.registerIDs[r] = id || "1";
                if (id) this.idRegisters[id] = r;
                Logger.debug2(`use-reg: ${r}`);
                Logger.debug2(`${this.registerIDs[r]} <-> ${r}`);
                return r;
            }
        }
        return Errors.raiseDebug("no free regs");
    }

    freeReg(r: string) {
        const id = this.registerIDs[r];
        this.registerIDs[r] = undefined;
        if (id) this.idRegisters[id] = undefined;
        Logger.debug2(`free-reg: ${r}`);
    }

    getReg(id: string) {
        if (!this.idRegisters[id]) Errors.raiseDebug(id);
        return this.idRegisters[id]!;
    }

    save(b: VmCodeBuilder) {
        const xs = [];
        for (const r of Object.keys(registers)) {
            if (r !== "r0" && this.registerIDs[r] !== undefined) {
                b.push_r(r);
                xs.push(r);
            }
        }
        return xs;
    }

    restore(b: VmCodeBuilder, xs: string[]) {
        xs = xs.reverse();

        for (const r of xs) {
            b.pop_r(r);
        }
    }

    static build() {
        return new Registers();
    }
}