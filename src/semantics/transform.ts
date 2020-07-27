/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import {
    A,
    P,
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
const NodeType = A.NodeType;

function doExpr(b: Block, e: A.Expr) {
    switch (e.nodeType) {
        case NodeType.BooleanLiteral: {
            const x = e as A.BooleanLiteral;
            return {
                value: x.value ? 1n : 0n,
                opType: OperationType.ReadImmediateInteger,
            };
        }
        case NodeType.StringLiteral: {
            const x = e as A.StringLiteral;
            return {
                value: x.value,
                opType: OperationType.ReadImmediateString,
            };
        }
        case NodeType.NumberLiteral: {
            const x = e as A.NumberLiteral;
            return {
                value: x.value,
                opType: OperationType.ReadImmediateInteger,
            };
        }
        case NodeType.IDExpr: {
            const x = e as A.IDExpr;
            return {
                id: b.getVar(x.id),
                opType: OperationType.ReadID,
            };
        }
        default: Errors.raiseDebug(JSON.stringify(e));
    }
}

function doStmt(b: Block, s: A.Stmt) {
    switch (s.nodeType) {
        case NodeType.VarInitStmt: {
            const x = s as A.VarInitStmt;
            b.defineVar(x.var);
            break;
        }
        case NodeType.VarAssnStmt: {
            const x = s as A.VarAssnStmt;
            const ide = x.lhs.nodeType === NodeType.DereferenceExpr ? (x.lhs as A.DereferenceExpr).expr : x.lhs as A.IDExpr;
            b.useVar(ide.id, doExpr(b, x.rhs));
            break;
        }
        case NodeType.FunctionApplicationStmt: {
            const x = s as A.FunctionApplicationStmt;
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

function doFunction(b: Block, f: P.Function) {
    b = b.newBlock(f.proto.id);
    f.proto.params.forEach(x => b.defineVar(x));
    f.body.forEach(x => doStmt(b, x));
}

export default function transform(m: P.Module) {
    Logger.info(`Transforming: ${m.path}`);

    const b = Block.build(m.path);

    for (const x of m.structs) {
        Errors.raiseDebug();
    }

    for (const x of m.foreignFunctions) {
        b.defineForeignFunction(x);
    }

    for (const x of m.functions) {
        b.defineFunction(x);
        doFunction(b, x);
    }

    return b;
}