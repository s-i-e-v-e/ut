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
    VarAssnStmt,
    FunctionApplicationStmt,
} from "../parser/mod.ts";
import {
    Logger,
    Errors,
    SymbolTable,
} from "./mod.ts";

function getExprType(st: SymbolTable, e: Expr) {
    switch (e.nodeType) {
        case NodeType.BooleanLiteral:
        case NodeType.StringLiteral:
        case NodeType.NumberLiteral: {
            return e.type;
        }
        default: Errors.raiseDebug(JSON.stringify(e));
    }
}

function doStmt(st: SymbolTable, s: Stmt) {
    switch (s.nodeType) {
        case NodeType.VarInitStmt: {
            const x = s as VarInitStmt;
            if (!st.typeExists(x.var.type)) {
                Errors.raiseUnknownType(x.var.type);
            }
            break;
        }
        case NodeType.VarAssnStmt: {
            const x = s as VarAssnStmt;
            const ltype = st.getType(x.id);
            if (!ltype) Errors.raiseUnknownIdentifier(x.id, x.loc);
            const rtype = getExprType(st, x.expr);
            if (ltype !== rtype) {
                Errors.raiseTypeMismatch(ltype, rtype);
            }
            break;
        }
        case NodeType.FunctionApplicationStmt: {
            const x = s as FunctionApplicationStmt;



            for (const a in x.fa.args) {

            }
            break;
        }
        default: Errors.raiseDebug();
    }
}

function doFunction(st: SymbolTable, f: Function) {
    f.params.forEach(x => {
        if (!st.typeExists(x.type)) Errors.raiseUnknownType(x.type);
    })
    if (!st.typeExists(f.returnType)) Errors.raiseUnknownType(f.returnType);
    f.body.forEach(x => doStmt(st.newTable(), x));
}

function doStruct(st: SymbolTable, s: Struct) {
    s.members.forEach(x => {
        if (!st.typeExists(x.type)) Errors.raiseUnknownType(x.type);
    })
}

export default function check(m: Module) {
    Logger.info(`Type checking: ${m.path}`);

    const global = SymbolTable.build();
    global.addType(KnownTypes.Integer);
    global.addType(KnownTypes.Bool);
    global.addType(KnownTypes.String);
    global.addType(KnownTypes.Void);

    for (const x of m.functions) {
        global.addFunction(x);
        doFunction(global, x);
    }

    for (const x of m.structs) {
        global.addStruct(x);
        doStruct(global, x);
    }
}