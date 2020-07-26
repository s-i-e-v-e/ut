/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import {
    Module,
    Stmt,
    Function,
    FunctionApplicationStmt,
    NodeType,
    VarAssnStmt,
    VarInitStmt,
    Expr,
    BooleanLiteral,
    IDExpr,
    NumberLiteral,
    StringLiteral,
    ArrayConstructor,
    FunctionApplication,
    ArrayExpr,
    ReturnStmt,
} from "../parser/mod.ts";
import {
    ByteBuffer,
    ForeignFunctions,
    registers,
    VmByteCode
} from "../vm/mod.ts";
import {
    Errors,
    Dictionary,
    Logger,
} from "../util/mod.ts";

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
                Logger.debug(`use-reg: ${r}`);
                return r;
            }
        }
        return Errors.raiseDebug("no free regs");
    }

    freeReg(r: string) {
        const id = this.registerIDs[r];
        this.registerIDs[r] = undefined;
        if (id) this.idRegisters[id] = undefined;
        Logger.debug(`free-reg: ${r}`);
    }

    getReg(id: string) {
        if (!this.idRegisters[id]) Errors.raiseDebug(id);
        return this.idRegisters[id]!;
    }

    save(vme: VmByteCode) {
        const xs = [];
        for (const r of Object.keys(registers)) {
            if (this.registerIDs[r] !== undefined) {
                vme.push_r(r);
                xs.push(r);
            }
        }
        return xs;
    }

    restore(vme: VmByteCode, xs: string[]) {
        xs = xs.reverse();

        for (const r of xs) {
            vme.pop_r(r);
        }
    }

    static build() {
        return new Registers();
    }
}

function emitExpr(vme: VmByteCode, regs: Registers, rd: string, e: Expr) {
    switch (e.nodeType) {
        case NodeType.BooleanLiteral: {
            const x = e as BooleanLiteral;
            vme.mov_r_i(rd, x.value ? 1 : 0);
            break;
        }
        case NodeType.StringLiteral: {
            const x = e as StringLiteral;
            vme.mov_r_str(rd, x.value);
            break;
        }
        case NodeType.NumberLiteral: {
            const x = e as NumberLiteral;
            vme.mov_r_i(rd, Number(x.value));
            break;
        }
        case NodeType.IDExpr: {
            const x = e as IDExpr;
            vme.mov_r_r(rd, regs.getReg(x.id));
            break;
        }
        case NodeType.FunctionApplication: {
            const x = e as FunctionApplication;

            // push used regs to stack
            const saved = regs.save(vme);

            // put args in  r0 ... rN
            for (let i = 0; i < x.args.length; i += 1) {
                const r = `r${i}`;
                emitExpr(vme, regs, r, x.args[i]);
            }
            vme.call(x.id);

            const tmp = regs.useReg();
            vme.mov_r_r(tmp, "r0");

            // pop used regs from stack
            regs.restore(vme, saved);

            vme.mov_r_r(rd, tmp);
            regs.freeReg(tmp);
            break;
        }
        case NodeType.ArrayConstructor: {
            const x = e as ArrayConstructor;

            const args = x.args!;
            const n = args.length;
            const step = 8;
            const bb = ByteBuffer.build(8 + 8 + (step * 8));
            bb.write_u64(n);
            bb.write_u64(step);
            for (let i = 0; i < args.length*8; i += 1) {
                bb.write_u8(0xCC);
            }
            const offset = vme.heapStore(bb.asBytes());

            const tmp = regs.useReg();
            let hp = offset + 8 + 8;
            for (let i = 0; i < args.length; i += 1) {
                emitExpr(vme, regs, tmp, args[i]);
                vme.mov_m_r(hp, tmp);
                hp += 8;
            }
            regs.freeReg(tmp);
            vme.mov_r_i(rd, offset);
            break;
        }
        case NodeType.ArrayExpr: {
            const x = e as ArrayExpr;

            const t0 = regs.useReg();
            emitExpr(vme, regs, t0, x.args[0]);

            // get element size offset
            const t1 = regs.useReg();
            vme.mov_r_r(t1, regs.getReg(x.id));
            vme.add_r_i(t1, 8);

            const t2 = regs.useReg();
            vme.mov_r_ro(t2, t1);
            vme.mul_r_r(t2, t0);

            vme.add_r_i(t1, 8);
            vme.add_r_r(t2, t1);

            //
            vme.mov_r_ro(rd, t2);
            regs.freeReg(t0);
            regs.freeReg(t1);
            regs.freeReg(t2);
            break;
        }
        default: Errors.raiseDebug(JSON.stringify(e.nodeType));
    }
}

function emitStmt(vme: VmByteCode, regs: Registers, s: Stmt) {
    switch (s.nodeType) {
        case NodeType.VarInitStmt: {
            const x = s as VarInitStmt;
            const rd = regs.useReg(x.var.id);
            emitExpr(vme, regs, rd, x.expr);
            break;
        }
        case NodeType.VarAssnStmt: {
            const x = s as VarAssnStmt;
            const rd = regs.getReg(x.lhs.id);
            emitExpr(vme, regs, rd, x.rhs);
            break;
        }
        case NodeType.FunctionApplicationStmt: {
            const x = s as FunctionApplicationStmt;
            const rd = regs.useReg();
            emitExpr(vme, regs, rd, x.fa);
            regs.freeReg(rd);
            break;
        }
        case NodeType.ReturnStmt: {
            const x = s as ReturnStmt;
            emitExpr(vme, regs, "r0", x.expr);
            vme.ret();
            break;
        }
        default: Errors.raiseDebug(""+s.nodeType);
    }
}

function emitFunction(vme: VmByteCode, f: Function) {
    vme.startFunction(f.proto.id);
    const regs = Registers.build();
    f.proto.params.forEach(x => regs.useReg(x.id));
    f.body.forEach(x => emitStmt(vme, regs, x));
    vme.ret();
}

export default function gen_vm_code(m: Module) {
    const vme = VmByteCode.build();

    // ivt - first 1024 bytes
    m.foreignFunctions.forEach(x => vme.addForeignFunction(x.proto.id, ForeignFunctions[x.proto.id]));

    // first, main
    const main = m.functions.filter(x => x.proto.id === "main")[0];
    emitFunction(vme, main);

    // then, rest
    const xs = m.functions.filter(x => x.proto.id !== "main");
    xs.forEach(x => emitFunction(vme, x));

    return vme;
}