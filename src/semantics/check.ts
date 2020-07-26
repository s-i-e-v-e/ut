/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import {
    ArrayConstructor,
    Expr,
    ForeignFunction,
    Function,
    FunctionApplication,
    FunctionApplicationStmt,
    FunctionPrototype,
    GenericType,
    IDExpr,
    KnownTypes,
    Location,
    Module,
    NodeType,
    ReturnStmt,
    Stmt,
    Struct,
    Type,
    VarAssnStmt,
    Variable,
    VarInitStmt,
    ArrayExpr,
    BinaryExpr,
} from "../parser/mod.ts";
import {
    SymbolTable,
} from "./mod.internal.ts";
import {
    Errors,
    Logger,
} from "../util/mod.ts";

function typesMatch(t1: Type, t2: Type) {
    const g1 = t1 as GenericType;
    const g2 = t2 as GenericType;

    let a = g1.id === g2.id;
    if (g1.typeParameters) {
        if (g2.typeParameters) {
            if (g1.typeParameters.length !== g2.typeParameters.length) return false;
            for (let i = 0; i < g1.typeParameters.length; i += 1) {
                a = a && typesMatch(g1.typeParameters[i], g2.typeParameters[i]);
            }
            return a;
        }
        else {
            return false;
        }
    }
    else {
        if (g2.typeParameters) {
            return false;
        }
        else {
            return a;
        }
    }
}

function typeExists(st: SymbolTable, t: Type, loc: Location): boolean {
    const g = t as GenericType;
    if (!st.getType(g.id)) return false;
    if (g.typeParameters && g.typeParameters.length) {
        let a = true;
        for (let i = 0; i < g.typeParameters.length; i += 1) {
            a = a && typeExists(st, g.typeParameters[i], loc);
        }
        return a;
    }
    else {
        return true;
    }
}

function checkTypes(st: SymbolTable, v: Variable, expr: Expr, loc: Location) {
    const ltype = v.type;
    const rtype = getExprType(st, expr);

    if (!typeExists(st, ltype, v.loc)) Errors.raiseUnknownType(ltype, loc);
    if (!typesMatch(ltype, rtype)) Errors.raiseTypeMismatch(ltype, rtype, loc);
}

function getVar(st: SymbolTable, id: string, loc: Location) {
    const x = st.getVar(id);
    if (!x) Errors.raiseUnknownIdentifier(id, loc);
    return x;
}

function getFunction(st: SymbolTable, id: string, loc: Location) {
    const x = st.getFunction(id);
    if (!x) Errors.raiseUnknownIdentifier(id, loc);
    return x;
}

function getExprType(st: SymbolTable, e: Expr): Type {
    let ty;
    switch (e.nodeType) {
        case NodeType.BooleanLiteral:
        case NodeType.StringLiteral:
        case NodeType.NumberLiteral: {
            ty = e.type;
            break;
        }
        case NodeType.IDExpr: {
            const x = e as IDExpr;
            ty = getVar(st, x.id, x.loc).type;
            break;
        }
        case NodeType.BinaryExpr: {
            const x = e as BinaryExpr;

            const ta = getExprType(st, x.left);
            const tb = getExprType(st, x.right);
            if (!typesMatch(ta, tb)) Errors.raiseTypeMismatch(ta, tb, x.loc);
            ty = ta;

            switch (x.op) {
                case "*":
                case "/":
                case "+":
                case "-": {
                    if (ty !== KnownTypes.Integer) Errors.raiseMathTypeError(ty, x.loc);
                    break;
                }
                default: {
                    Errors.raiseDebug();
                }
            }
            break;
        }
        case NodeType.FunctionApplication: {
            const x = e as FunctionApplication;
            if (st.varExists(x.id)) {
                e.nodeType = NodeType.ArrayExpr
                ty = getExprType(st, e);
            }
            else {
                ty = getFunction(st, x.id, x.loc).returnType;
            }
            break;
        }
        case NodeType.ArrayExpr: {
            const x = e as ArrayExpr;
            const at = getVar(st, x.id, x.loc).type as GenericType;
            ty = at.typeParameters[0];
            break;
        }
        case NodeType.ArrayConstructor: {
            const x = e as ArrayConstructor;
            if (x.args) {
                // check arg types
                // get type of first arg
                const et = getExprType(st, x.args[0]) as GenericType;
                x.args.forEach(y => {
                    if (!typesMatch(et, y.type)) Errors.raiseTypeMismatch(et, y.type, y.loc);
                })

                // can infer type from constructor args
                const ty = x.type as GenericType;
                if (!ty.typeParameters) {
                    ty.typeParameters = [et];
                }
                else {
                    if (!typesMatch(ty.typeParameters[0], et)) Errors.raiseTypeMismatch(ty.typeParameters[0], et, x.loc);
                }
            }
            else {
                // ignore
            }
            return x.type;
        }
        default: Errors.raiseDebug(JSON.stringify(e));
    }
    if (!st.typeExists(ty)) Errors.raiseUnknownType(ty, e.loc);
    return ty;
}

function doStmt(st: SymbolTable, fp: FunctionPrototype, s: Stmt) {
    switch (s.nodeType) {
        case NodeType.VarInitStmt: {
            const x = s as VarInitStmt;

            // infer
            const ty = getExprType(st, x.expr);
            if (x.var.type === KnownTypes.NotInferred) {
                x.var.type = ty;
            }

            // check
            if (!st.typeExists(x.var.type)) Errors.raiseUnknownType(x.var.type, x.var.loc);
            st.addVar(x.var);
            checkTypes(st, x.var, x.expr, x.loc);
            break;
        }
        case NodeType.VarAssnStmt: {
            const x = s as VarAssnStmt;
            const v = getVar(st, x.lhs.id, x.loc);

            // check assignments to immutable vars
            if (!v.isMutable) Errors.raiseImmutableVar(v);

            checkTypes(st, v, x.rhs, x.loc);
            break;
        }
        case NodeType.FunctionApplicationStmt: {
            const x = s as FunctionApplicationStmt;
            const f = getFunction(st, x.fa.id, x.fa.loc);
            if (x.fa.args.length != f.params.length) Errors.raiseFunctionParameterCountMismatch(x.fa.id, x.loc);

            for (let i = 0; i < x.fa.args.length; i += 1) {
                const atype = getExprType(st, x.fa.args[i]);
                const ptype = f.params[i].type;
                if (!typesMatch(atype, ptype)) Errors.raiseTypeMismatch(atype, ptype, x.loc);
            }
            break;
        }
        case NodeType.ReturnStmt: {
            const x = s as ReturnStmt;
            const ty = getExprType(st, x.expr);
            if (fp.returnType === KnownTypes.NotInferred) {
                fp.returnType = ty;
            }
            else {
                if (!typesMatch(fp.returnType, ty)) Errors.raiseTypeMismatch(fp.returnType, ty, x.loc);
            }
            break;
        }
        default: Errors.raiseDebug();
    }
}

function doFunctionReturnType(st: SymbolTable, fp: FunctionPrototype) {
    if (!st.typeExists(fp.returnType)) Errors.raiseUnknownType(fp.returnType, fp.loc);
}

function doFunctionPrototype(st: SymbolTable, fp: FunctionPrototype) {
    fp.params.forEach(x => {
        if (!st.typeExists(x.type)) Errors.raiseUnknownType(x.type, x.loc);
        st.addVar(x);
    })
}

function doFunction(st: SymbolTable, f: Function) {
    if (f.proto.id === "main" && f.proto.returnType === KnownTypes.NotInferred) {
        f.proto.returnType = KnownTypes.Void;
    }
    st = st.newTable();
    doFunctionPrototype(st, f.proto);
    f.tag = st;
}

function doForeignFunction(st: SymbolTable, f: ForeignFunction) {
    if (f.proto.returnType === KnownTypes.NotInferred) {
        f.proto.returnType = KnownTypes.Void;
    }
    st = st.newTable();
    doFunctionPrototype(st, f.proto);
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
    global.addType(KnownTypes.Array);

    for (const x of m.structs) {
        global.addStruct(x);
        doStruct(global, x);
    }

    for (const x of m.foreignFunctions) {
        global.addFunction(x.proto);
        doForeignFunction(global, x);
    }

    for (const x of m.functions) {
        global.addFunction(x.proto);
        doFunction(global, x);
    }

    for (const x of m.functions) {
        const st = x.tag as SymbolTable;
        x.body.forEach(y => doStmt(st, x.proto, y));
    }

    // check return types
    for (const x of m.foreignFunctions) {
        doFunctionReturnType(global, x.proto);
    }

    for (const x of m.functions) {
        doFunctionReturnType(global, x.proto);
    }
}