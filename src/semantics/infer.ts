/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import {
    Module,
    Function,
    Struct,
    Stmt,
    VarInitStmt,
    Expr,
    NodeType,
    KnownTypes,
    ArrayConstructor, GenericType, toTypeString,
} from "../parser/mod.ts";
import {
    Errors,
    Logger,
} from "../util/mod.ts";

function getExprType(e: Expr) {
    switch (e.nodeType) {
        case NodeType.BooleanLiteral:
        case NodeType.StringLiteral:
        case NodeType.NumberLiteral: {
            return e.type;
        }
        case NodeType.ArrayConstructor: {
            const x = e as ArrayConstructor;
            if (x.args) {
                // can infer type from constructor args
                const ty = x.type as GenericType;
                if (!ty.typeParameters) {
                    // get type of first arg
                    const et = getExprType(x.args[0]) as GenericType;
                    ty.typeParameters = [et];
                }
                else {
                    // ignore
                }
            }
            else {
                // ignore
            }
            return x.type;
        }
        default: Errors.raiseDebug(JSON.stringify(e));
    }
}

function doStmt(s: Stmt) {
    switch (s.nodeType) {
        case NodeType.VarInitStmt: {
            const x = s as VarInitStmt;
            const ty = getExprType(x.expr);
            if (x.var.type === KnownTypes.NotInferred) {
                x.var.type = ty;
            }
            break;
        }
        case NodeType.VarAssnStmt: {
            // do nothing
            break;
        }
        case NodeType.FunctionApplicationStmt: {
            // do nothing
            break;
        }
        default: Errors.raiseDebug();
    }
}

function doFunction(f: Function) {
    f.body.forEach(x => doStmt(x));
    if (f.proto.id === "main" && f.proto.returnType === KnownTypes.NotInferred) {
        f.proto.returnType = KnownTypes.Void;
    }
}

function doStruct(x: Struct) {

}

export default function infer(m: Module) {
    Logger.info(`Type inference: ${m.path}`);

    for (const x of m.functions) {
        doFunction(x);
    }

    for (const x of m.structs) {
        doStruct(x);
    }
}