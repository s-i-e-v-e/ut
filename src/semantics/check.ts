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
    KnownFunctions,
    VarAssnStmt,
    FunctionApplicationStmt,
    Type,
    IDExpr,
} from "../parser/mod.ts";
import {
    Logger,
    Errors,
    SymbolTable,
} from "./mod.ts";

function typesMatch(t1: Type, t2: Type) {
    return t1.id === t2.id;
}

function getExprType(st: SymbolTable, e: Expr) {
    switch (e.nodeType) {
        case NodeType.BooleanLiteral:
        case NodeType.StringLiteral:
        case NodeType.NumberLiteral: {
            return e.type;
        }
        case NodeType.IDExpr: {
            const x = e as IDExpr;
            const v = st.getVar(x.id);
            if (!v) Errors.raiseUnknownIdentifier(x.id, x.loc);
            return v.type;
        }
        default: Errors.raiseDebug(JSON.stringify(e));
    }
}

function doStmt(st: SymbolTable, s: Stmt) {
    switch (s.nodeType) {
        case NodeType.VarInitStmt: {
            const x = s as VarInitStmt;
            if (!st.typeExists(x.var.type)) Errors.raiseUnknownType(x.var.type, x.var.loc);
            st.addVar(x.var);
            break;
        }
        case NodeType.VarAssnStmt: {
            const x = s as VarAssnStmt;
            const v = st.getVar(x.id);
            if (!v) Errors.raiseUnknownIdentifier(x.id, x.loc);

            // check assignments to immutable vars
            if (!v.isMutable) Errors.raiseImmutableVar(v);

            // check type match
            const ltype = v.type;
            const rtype = getExprType(st, x.expr);

            if (!st.getType(ltype.id)) Errors.raiseUnknownType(ltype, v.loc);
            if (!st.getType(rtype.id)) Errors.raiseUnknownType(rtype, x.loc);
            if (!typesMatch(ltype, rtype)) Errors.raiseTypeMismatch(ltype, rtype, x.loc);
            break;
        }
        case NodeType.FunctionApplicationStmt: {
            const x = s as FunctionApplicationStmt;
            const f = st.getFunction(x.fa.id);
            if (!f) Errors.raiseUnknownIdentifier(x.fa.id, x.loc);
            if (x.fa.args.length != f.params.length) Errors.raiseFunctionParameterCountMismatch(x.fa.id, x.loc);

            for (let i = 0; i < x.fa.args.length; i += 1) {
                const atype = getExprType(st, x.fa.args[i]);
                const ptype = f.params[i].type;
                if (!typesMatch(atype, ptype)) Errors.raiseTypeMismatch(atype, ptype, x.loc);
            }
            break;
        }
        default: Errors.raiseDebug();
    }
}

function doFunction(st: SymbolTable, f: Function) {
    f.params.forEach(x => {
        if (!st.typeExists(x.type)) Errors.raiseUnknownType(x.type, x.loc);
        st.addVar(x);
    })
    if (!st.typeExists(f.returnType)) Errors.raiseUnknownType(f.returnType, f.loc);
    st = st.newTable();
    f.body.forEach(x => doStmt(st, x));
}

function doStruct(st: SymbolTable, s: Struct) {
    s.members.forEach(x => {
        if (!st.typeExists(x.type)) Errors.raiseUnknownType(x.type, x.loc);
    })
}

export default function check(m: Module) {
    Logger.info(`Type checking: ${m.path}`);

    const global = SymbolTable.build();
    global.addType(KnownTypes.Integer);
    global.addType(KnownTypes.Bool);
    global.addType(KnownTypes.String);
    global.addType(KnownTypes.Void);

    global.addFunction(KnownFunctions.SysExit);

    for (const x of m.functions) {
        global.addFunction(x);
        doFunction(global, x);
    }

    for (const x of m.structs) {
        global.addStruct(x);
        doStruct(global, x);
    }
}