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
    Function,
    FunctionApplicationStmt,
    IDExpr,
    Module,
    NodeType,
    NumberLiteral,
    Stmt,
    StringLiteral,
    VarAssnStmt,
    VarInitStmt,
} from "../parser/mod.ts";
import {
    Block,
    OperationType,
    ReadID,
} from "./mod.ts";
import {
    Errors,
    Logger,
} from "../util/mod.ts";

function doExpr(b: Block, e: Expr) {
    switch (e.nodeType) {
        case NodeType.BooleanLiteral: {
            const x = e as BooleanLiteral;
            return {
                value: x.value ? 1n : 0n,
                opType: OperationType.ReadImmediateInteger,
            };
        }
        case NodeType.StringLiteral: {
            const x = e as StringLiteral;
            return {
                value: x.value,
                opType: OperationType.ReadImmediateString,
            };
        }
        case NodeType.NumberLiteral: {
            const x = e as NumberLiteral;
            return {
                value: x.value,
                opType: OperationType.ReadImmediateInteger,
            };
        }
        case NodeType.IDExpr: {
            const x = e as IDExpr;
            return {
                id: b.getVar(x.id),
                opType: OperationType.ReadID,
            };
        }
        default: Errors.raiseDebug(JSON.stringify(e));
    }
}

function doStmt(b: Block, s: Stmt) {
    switch (s.nodeType) {
        case NodeType.VarInitStmt: {
            const x = s as VarInitStmt;
            b.defineVar(x.var);
            break;
        }
        case NodeType.VarAssnStmt: {
            const x = s as VarAssnStmt;
            b.useVar(x.id, doExpr(b, x.expr));
            break;
        }
        case NodeType.FunctionApplicationStmt: {
            const x = s as FunctionApplicationStmt;
            const xs = [];
            for (let i = 0; i < x.fa.args.length; i += 1) {
                const ev = doExpr(b, x.fa.args[i]);
                if (ev.opType === OperationType.ReadID) {
                    const x = ev as ReadID;
                    xs.push(x.id);
                }
                else {
                    const tv = b.defineTempVar();
                    b.useVar(tv, ev);
                    xs.push(tv);
                }
            }
            b.call(x.fa.id, xs);
            break;
        }
        default: Errors.raiseDebug();
    }
}

function doFunction(b: Block, f: Function) {
    b = b.newBlock(f.proto.id);
    f.proto.params.forEach(x => b.defineVar(x));
    f.body.forEach(x => doStmt(b, x));
}

export default function transform(m: Module) {
    Logger.info(`Transforming: ${m.path}`);

    const b = Block.build(m.path);

    for (const x of m.structs) {
        Errors.raiseDebug();
    }

    for (const x of m.foreignFunctions) {
        b.defineFunction(x.proto);
    }

    for (const x of m.functions) {
        b.defineFunction(x.proto);
        doFunction(b, x);
    }

    return b;
}