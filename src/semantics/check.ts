/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import {
    Location,
    P,
    A,
} from "../parser/mod.ts";
import {
    SymbolTable,
} from "./mod.internal.ts";
import {
    Errors,
    Logger,
} from "../util/mod.ts";

const KnownTypes = P.KnownTypes;
type Type = P.Type;
type GenericType = P.GenericType;
type Stmt = A.Stmt;
type Expr = A.Expr;
const NodeType = A.NodeType;

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

function checkTypes(st: SymbolTable, block: A.BlockExpr, le_or_type: Type|Expr, re: Expr, loc: Location) {
    const ltype = (le_or_type as Expr).nodeType ? getExprType(st, block, le_or_type as Expr) : le_or_type as Type;
    const rtype = getExprType(st, block, re);

    if (!typeExists(st, ltype, loc)) Errors.raiseUnknownType(ltype, loc);
    if (!typesMatch(ltype, rtype)) Errors.raiseTypeMismatch(ltype, rtype, loc);
}

function getVar(st: SymbolTable, id: string, loc: Location) {
    const x = st.getVar(id);
    if (!x) Errors.raiseUnknownIdentifier(id, loc);
    return x;
}

function resolveDereferenceExpr(x: A.DereferenceExpr) {
    while (x.expr.nodeType === NodeType.DereferenceExpr) {
        x = x.expr as A.DereferenceExpr;
    }
    return x;
}

function resolveVar(st: SymbolTable, e: Expr): P.Variable {
    switch (e.nodeType) {
        case NodeType.IDExpr: {
            const x = e as A.IDExpr;
            return getVar(st, x.id, x.loc);
        }
        case NodeType.ArrayExpr: {
            const x = e as A.ArrayExpr;
            return getVar(st, x.id, x.loc);
        }
        case NodeType.DereferenceExpr: {
            const x = resolveDereferenceExpr(e as A.DereferenceExpr);
            const y = x.expr as A.IDExpr;
            return getVar(st, y.id, y.loc);
        }
        default: Errors.raiseDebug();
    }
}

function getFunction(st: SymbolTable, id: string, loc: Location) {
    const x = st.getFunction(id);
    if (!x) Errors.raiseUnknownIdentifier(id, loc);
    return x;
}

function setBlockType(st: SymbolTable, block: A.BlockExpr, expr: Expr) {
    const ty = getExprType(st, block, expr);
    if (block.type === KnownTypes.NotInferred) {
        block.type = ty;
    }
    else {
        if (!typesMatch(block.type, ty)) Errors.raiseTypeMismatch(block.type, ty, expr.loc);
    }
    return ty;
}

function getExprType(st: SymbolTable, block: A.BlockExpr, e: Expr): Type {
    let ty;
    switch (e.nodeType) {
        case NodeType.BooleanLiteral:
        case NodeType.StringLiteral:
        case NodeType.NumberLiteral: {
            ty = e.type;
            break;
        }
        case NodeType.IDExpr: {
            const x = e as A.IDExpr;
            ty = getVar(st, x.id, x.loc).type;
            break;
        }
        case NodeType.BinaryExpr: {
            const x = e as A.BinaryExpr;

            const ta = getExprType(st, block, x.left);
            const tb = getExprType(st, block, x.right);
            if (!typesMatch(ta, tb)) Errors.raiseTypeMismatch(ta, tb, x.loc);

            switch (x.op) {
                case "%":
                case "*":
                case "/":
                case "+":
                case "-": {
                    ty = ta;
                    if (ty !== KnownTypes.Integer) Errors.raiseMathTypeError(ty, x.loc);
                    break;
                }
                case ">":
                case "<":
                case ">=":
                case "<=": {
                    if (ta !== KnownTypes.Integer) Errors.raiseMathTypeError(ta, x.loc);
                    ty = KnownTypes.Bool;
                    break;
                }
                case "==":
                case "!=": {
                    ty = KnownTypes.Bool;
                    break;
                }
                case "|":
                case "&": {
                    ty = ta;
                    if (ty !== KnownTypes.Bool) Errors.raiseLogicalOperationError(ty, x.loc);
                    break;
                }
                default: {
                    Errors.raiseDebug();
                }
            }
            break;
        }
        case NodeType.FunctionApplication: {
            const x = e as A.FunctionApplication;
            if (st.varExists(x.id)) {
                const y = x as A.ArrayExpr;
                y.nodeType = NodeType.ArrayExpr;
                ty = getExprType(st, block, y);
            }
            else {
                const f = getFunction(st, x.id, x.loc);
                if (x.args.length != f.params.length) Errors.raiseFunctionParameterCountMismatch(x.id, x.loc);

                for (let i = 0; i < x.args.length; i += 1) {
                    const atype = getExprType(st, block, x.args[i]);
                    const ptype = f.params[i].type;
                    if (!typesMatch(atype, ptype)) Errors.raiseTypeMismatch(atype, ptype, x.loc);
                }
                ty = f.type;
            }
            break;
        }
        case NodeType.ArrayExpr: {
            const x = e as A.ArrayExpr;
            const at = getVar(st, x.id, x.loc).type as GenericType;

            x.args.forEach(a => {
                const ty = getExprType(st, block, a);
                if (ty !== KnownTypes.Integer) Errors.raiseArrayIndexError(a.type, a.loc);
            });

            ty = at.typeParameters[0];
            break;
        }
        case NodeType.ArrayConstructor: {
            const x = e as A.ArrayConstructor;
            if (x.args) {
                // check arg types
                // get type of first arg
                const et = getExprType(st, block, x.args[0]) as GenericType;
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
        case NodeType.LocalReturnExpr: {
            const x = e as A.LocalReturnExpr;
            ty = setBlockType(st, block, x.expr);
            break;
        }
        case NodeType.ReturnExpr: {
            const x = e as A.ReturnExpr;
            let b = block;
            while (b.parent) {
                b = b.parent;
            }
            ty = setBlockType(st, b, x.expr);
            break;
        }
        case NodeType.IfExpr: {
            const x = e as A.IfExpr;
            const t = getExprType(st, block, x.condition);
            if (t !== KnownTypes.Bool) Errors.raiseIfConditionError(t, x.loc);

            doBlock(st, x.ifBranch);
            doBlock(st, x.elseBranch);
            if (!typesMatch(x.ifBranch.type, x.elseBranch.type)) Errors.raiseTypeMismatch(x.ifBranch.type, x.elseBranch.type, x.loc);
            x.type = x.ifBranch.type === KnownTypes.NotInferred ? KnownTypes.Void: x.ifBranch.type;
            ty = x.type;
            break;
        }
        case NodeType.CastExpr: {
            const x = e as A.CastExpr;
            const t = getExprType(st, block, x.expr);
            ty = x.type;
            break;
        }
        case NodeType.VoidExpr: {
            ty = e.type;
            break;
        }
        case NodeType.ReferenceExpr: {
            const xx = e as A.ReferenceExpr;
            const t = getExprType(st, block, xx.expr);
            const y = xx.expr;
            switch (y.nodeType) {
                case NodeType.IDExpr:
                case NodeType.ArrayExpr: {
                    ty = {
                        id: KnownTypes.Pointer.id,
                        typeParameters: [t],
                        loc: y.loc,
                    } as GenericType;
                    break;
                }
                default: Errors.raiseDebug("can only acquire reference to lvalues: "+y.nodeType);
            }
            break;
        }
        case NodeType.DereferenceExpr: {
            const x = e as A.DereferenceExpr;
            const t = getExprType(st, block, x.expr) as GenericType;
            if (t.typeParameters) {
                ty = t.typeParameters[0];
            }
            else {
                Errors.raiseDebug("cannot dereference: "+t.id);
            }
            break;
        }
        default: Errors.raiseDebug(NodeType[e.nodeType]);
    }
    if (!st.typeExists(ty)) Errors.raiseUnknownType(ty, e.loc);
    if (e.type === KnownTypes.NotInferred) {
        e.type = ty;
    }
    return ty;
}

function doStmt(st: SymbolTable, block: A.BlockExpr, s: Stmt) {
    switch (s.nodeType) {
        case NodeType.VarInitStmt: {
            const x = s as A.VarInitStmt;

            // infer
            const ty = getExprType(st, block, x.expr);
            if (x.var.type === KnownTypes.NotInferred) {
                x.var.type = ty;
            }

            // check
            if (!st.typeExists(x.var.type)) Errors.raiseUnknownType(x.var.type, x.var.loc);
            st.addVar(x.var);
            checkTypes(st, block, x.var.type, x.expr, x.loc);
            break;
        }
        case NodeType.VarAssnStmt: {
            const x = s as A.VarAssnStmt;
            const v = resolveVar(st, x.lhs);

            // check assignments to immutable vars
            if (!v.isMutable) Errors.raiseImmutableVar(v, x.loc);

            checkTypes(st, block, x.lhs, x.rhs, x.loc);
            break;
        }
        case NodeType.ExprStmt: {
            const x = s as A.ExprStmt;
            getExprType(st, block, x.expr);
            break;
        }
        case NodeType.ForStmt: {
            const x = s as A.ForStmt;
            st = st.newTable();

            if (x.init) doStmt(st, block, x.init);
            if (x.condition) {
                const t = getExprType(st, block, x.condition);
                if (t !== KnownTypes.Bool) Errors.raiseForConditionError(t, x.loc);
            }
            if (x.update) doStmt(st, block, x.update);
            doBlock(st, x.body);
            break;
        }
        default: Errors.raiseDebug(NodeType[s.nodeType]);
    }
}

function doBlock(st: SymbolTable, block: A.BlockExpr) {
    st = st.newTable();
    block.xs.forEach(y => doStmt(st, block, y));
}

function doFunctionReturnType(st: SymbolTable, fp: P.FunctionPrototype) {
    if (!st.typeExists(fp.type)) Errors.raiseUnknownType(fp.type, fp.loc);
}

function doFunctionPrototype(st: SymbolTable, fp: P.FunctionPrototype) {
    fp.params.forEach(x => {
        if (!st.typeExists(x.type)) Errors.raiseUnknownType(x.type, x.loc);
        st.addVar(x);
    })
}

function doFunction(st: SymbolTable, f: P.Function) {
    if (f.proto.id == "main") f.body.type = KnownTypes.Void;
    st = st.newTable();
    doFunctionPrototype(st, f.proto);
    doBlock(st, f.body);
    f.proto.type = f.body.type;
    if (f.proto.type === KnownTypes.NotInferred) f.proto.type = KnownTypes.Void;
}

function doForeignFunction(st: SymbolTable, f: P.ForeignFunction) {
    if (f.proto.type === KnownTypes.NotInferred) {
        f.proto.type = KnownTypes.Void;
    }
    st = st.newTable();
    doFunctionPrototype(st, f.proto);
}

function doStruct(st: SymbolTable, s: P.Struct) {
    s.members.forEach(x => {
        if (!st.typeExists(x.type)) Errors.raiseUnknownType(x.type, x.loc);
    })
}

export default function check(m: P.Module) {
    Logger.info(`Type checking: ${m.path}`);

    const global = SymbolTable.build();
    global.addType(KnownTypes.Integer);
    global.addType(KnownTypes.Bool);
    global.addType(KnownTypes.String);
    global.addType(KnownTypes.Void);
    global.addType(KnownTypes.Pointer);
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

    // check return types
    for (const x of m.foreignFunctions) {
        doFunctionReturnType(global, x.proto);
    }

    for (const x of m.functions) {
        doFunctionReturnType(global, x.proto);
    }
}