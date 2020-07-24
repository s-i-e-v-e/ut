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
} from "../parser/mod.ts";
import {ForeignFunctions, VmByteCode} from "../vm/mod.ts";
import {
    Errors,
    Dictionary,
} from "../util/mod.ts";

export class Registers {
    private static REG_MAX = 15;
    private readonly registers: Dictionary<string|undefined>;
    private _index: number;

    private constructor() {
        this.registers = {};
        this._index = 0;
    }

    index() {
        return this._index;
    }

    useReg(id: string) {
        if (this._index > Registers.REG_MAX) Errors.raiseDebug(id);
        const reg = `r${this._index}`;
        this.registers[id] = reg;
        this._index += 1;
        return reg;
    }

    getReg(id: string) {
        if (!this.registers[id]) Errors.raiseDebug(id);
        return this.registers[id]!;
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
        default: Errors.raiseDebug(JSON.stringify(e));
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
            const rd = regs.getReg(x.id);
            emitExpr(vme, regs, rd, x.expr);
            break;
        }
        case NodeType.FunctionApplicationStmt: {
            const x = s as FunctionApplicationStmt;

            const ops = []

            // push used regs to stack
            const usedRegCount = regs.index();
            for (let i = 0; i < usedRegCount; i += 1) {
                const r = `r${i}`;
                vme.push_r(r)
            }

            // put args in  r0 ... rN
            const ys = [];
            for (let i = 0; i < x.fa.args.length; i += 1) {
                const r = `r${i}`;
                emitExpr(vme, regs, r, x.fa.args[i]);
            }
            vme.call(x.fa.id);

            // pop used regs from stack
            for (let i = 0; i < usedRegCount; i += 1) {
                const r = `r${usedRegCount - i - 1}`;
                vme.pop_r(r)
            }
            break;
        }
        default: Errors.raiseDebug();
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