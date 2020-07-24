/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import {
    BooleanLiteral,
    Expr,
    ForeignFunction,
    Function,
    FunctionApplicationStmt,
    FunctionPrototype,
    IDExpr,
    KnownTypes,
    Module,
    NodeType,
    NumberLiteral,
    Parameter,
    Stmt,
    StringLiteral,
    Type,
    VarAssnStmt,
    Variable,
    VarInitStmt
} from "../parser/mod.ts";
import {Errors} from "../util/mod.ts";
import {VmOperation, VmOpType, VmParameter, VmState, VmType, VmVariable,} from "./mod.internal.ts";

function translateType(x: Type) {
    switch (x.id) {
        case KnownTypes.String.id: return VmType.Reference;
        case KnownTypes.Void.id:
        case KnownTypes.Integer.id:
        case KnownTypes.Bool.id:{
            return VmType.Register;
        }
        default: Errors.raiseDebug();
    }
}

function translateExpr(vs: VmState, rd: string, e: Expr) {
    switch (e.nodeType) {
        case NodeType.BooleanLiteral: {
            const x = e as BooleanLiteral;
            return {
                rd: rd,
                source: x.value ? 1n : 0n,
                opType: VmOpType.MovIntegerLiteral,
            };
        }
        case NodeType.StringLiteral: {
            const x = e as StringLiteral;
            return {
                rd: rd,
                source: x.value,
                opType: VmOpType.MovStringLiteral,
            };
        }
        case NodeType.NumberLiteral: {
            const x = e as NumberLiteral;
            return {
                rd: rd,
                source: x.value,
                opType: VmOpType.MovIntegerLiteral,
            };
        }
        case NodeType.IDExpr: {
            const x = e as IDExpr;
            return {
                rd: rd,
                rs: vs.getReg(x.id),
                opType: VmOpType.MovR2R,
            };
        }
        default: Errors.raiseDebug(JSON.stringify(e));
    }
}

function translateStmt(vs: VmState, s: Stmt) {
    switch (s.nodeType) {
        case NodeType.VarInitStmt: {
            const x = s as VarInitStmt;
            vs.useReg(x.var.id);
            return [{ opType: VmOpType.RegAlloc }];
        }
        case NodeType.VarAssnStmt: {
            const x = s as VarAssnStmt;
            const rd = vs.getReg(x.id);
            return [translateExpr(vs, rd, x.expr)];
        }
        case NodeType.FunctionApplicationStmt: {
            const x = s as FunctionApplicationStmt;

            const ops = []

            // create temp registers and clear r0 ... rN
            const xs = [];
            // put args in  r0 ... rN
            const ys = [];
            for (let i = 0; i < x.fa.args.length; i += 1) {
                const tr = vs.useTempReg();
                const reg = `r${i}`;
                const op = translateExpr(vs, reg, x.fa.args[i]);
                if (op.rd !== op.rs) {
                    xs.push(tr);
                    ys.push(reg);
                    ops.push({
                        rd: tr,
                        rs: reg,
                        opType: VmOpType.MovR2R,
                    });

                    ops.push(op);
                }
            }

            // call
            ops.push({
                id: x.fa.id,
                args: ys,
                opType: VmOpType.Call
            });

            // move values back into r0 ... rN
            for (let i = 0; i < xs.length; i += 1) {
                const rd = `r${i}`;
                const rs = xs[i];
                ops.push({
                    rd: rd,
                    rs: rs,
                    opType: VmOpType.MovR2R,
                });
            }
            return ops;
        }
        default: Errors.raiseDebug();
    }
}

function translateVariable(x: Variable): VmVariable {
    return {
        id: x.id,
        type: translateType(x.type),
    }
}

function translateParameter(vs: VmState, x: Parameter): VmParameter {
    vs.useReg(x.id);
    return {
        id: x.id,
        type: translateType(x.type),
    }
}

function translatePrototype(vs: VmState, fp: FunctionPrototype) {
    return {
        id: fp.id,
        params: fp.params.map(x => translateParameter(vs, x)),
        returnType: translateType(fp.returnType),
    }
}

function translateForeignFunction(f: ForeignFunction) {
    const vs = VmState.build();
    return {
        proto: translatePrototype(vs, f.proto)
    }
}

function translateFunction(f: Function) {
    const vs = VmState.build();
    return {
        proto: translatePrototype(vs, f.proto),
        body: (() => {
            const xss = f.body.map(x => translateStmt(vs, x));
            const ys: Array<VmOperation> = [];
            for (const xs of xss) {
                ys.push(...xs);
            }
            return ys;
        })(),
    }
}

export default function build_vm_program(m: Module) {
    return {
        functions: m.functions.map(x => translateFunction(x)),
        foreignFunctions: m.foreignFunctions.map(x => translateForeignFunction(x)),
    }
}