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
    Types,
} from "./mod.internal.ts";
import {
    Dictionary,
    Errors,
    Logger,
} from "../util/mod.ts";

const KnownTypes = P.KnownTypes;
const NativeTypes = P.NativeTypes;
type Type = P.Type;
type GenericType = P.GenericType;
type Stmt = A.Stmt;
type Expr = A.Expr;
const NodeType = A.NodeType;

function ifMustReturn(be: A.BlockExpr) {
    // last statement must be a return
    const last = be.xs.length ? be.xs[be.xs.length - 1] : undefined;
    if (last && last.nodeType === NodeType.ExprStmt) {
        const es = (last as A.ExprStmt);
        const e = {
            nodeType: NodeType.LocalReturnExpr,
            expr: es.expr,
            loc: es.loc,
        } as A.LocalReturnExpr;
        es.expr = e;
        if (e.expr.nodeType == NodeType.IfExpr) {
            const x = e.expr as A.IfExpr;
            ifMustReturn(x.ifBranch);
            ifMustReturn(x.elseBranch);
        }
    }
    else {
        Errors.raiseIfExprMustReturn(be.loc);
    }
}

function checkTypes(st: SymbolTable, block: A.BlockExpr, le_or_type: Type|Expr, re: Expr, loc: Location) {
    const ltype = (le_or_type as Expr).nodeType ? getExprType(st, block, le_or_type as Expr) : le_or_type as Type;
    const rtype = getExprType(st, block, re);

    if (!Types.typeExists(st, ltype, loc)) Errors.raiseUnknownType(ltype, loc);
    Types.typesMustMatch(st, ltype, rtype, loc);
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
            return getVar(st, x.expr.id, x.loc);
        }
        case NodeType.DereferenceExpr: {
            const x = resolveDereferenceExpr(e as A.DereferenceExpr);
            const y = x.expr as A.IDExpr;
            return getVar(st, y.id, y.loc);
        }
        case NodeType.CastExpr: {
            const x = e as A.CastExpr;
            const y = x.expr as A.IDExpr;
            if (y.nodeType !== NodeType.IDExpr) Errors.raiseDebug();
            return getVar(st, y.id, x.loc);
        }
        default: Errors.raiseDebug(NodeType[e.nodeType]);
    }
}

function getFunction(st: SymbolTable, argTypes: Type[], id: string, loc: Location): P.FunctionPrototype {
    const f = st.getFunction(id, argTypes, loc);
    if (!f) Errors.raiseUnknownIdentifier(id, loc);
    return f;
}

function setBlockType(st: SymbolTable, block: A.BlockExpr, expr: Expr) {
    const ty = getExprType(st, block, expr);
    if (Types.typeNotInferred(block.type)) {
        block.type = ty;
    }
    else {
        Types.typesMustMatch(st, block.type, ty, expr.loc);
    }
    return ty;
}

function getExprType(st: SymbolTable, block: A.BlockExpr, e: Expr): Type {
    if (st.as.ret) Errors.raiseUnreachableCode(e.loc);
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
            Types.typesMustMatch(st, ta, tb, x.loc);

            switch (x.op) {
                case "%":
                case "*":
                case "/":
                case "+":
                case "-": {
                    if (!Types.typesMatch(st, ta, KnownTypes.Integer)) Errors.raiseMathTypeError(ta, x.loc);
                    ty = ta;
                    break;
                }
                case ">":
                case "<":
                case ">=":
                case "<=": {
                    if (!Types.typesMatch(st, ta, KnownTypes.Integer)) Errors.raiseMathTypeError(ta, x.loc);
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
                    if (!Types.typesMatch(st, ta, KnownTypes.Bool)) Errors.raiseLogicalOperationError(ta, x.loc);
                    ty = ta;
                    break;
                }
                default: {
                    Errors.raiseDebug(x.op);
                }
            }
            break;
        }
        case NodeType.FunctionApplication: {
            const x = e as A.FunctionApplication;
            if (st.varExists(x.expr.id) && !x.expr.rest) {
                const y = x as A.ArrayExpr;
                y.nodeType = NodeType.ArrayExpr;
                ty = getExprType(st, block, y);
            }
            else {
                // deconstruct UFCS call
                if (x.expr.rest) {
                    const a = {
                        nodeType: NodeType.IDExpr,
                        type: KnownTypes.NotInferred,
                        loc: x.expr.loc,
                        id: x.expr.id,
                    };
                    x.expr.id = x.expr.rest;
                    x.expr.rest = undefined;
                    const xs = [];
                    xs.push(a)
                    xs.push(...x.args);
                    x.args = xs;
                }

                const argTypes = x.args.map(x => getExprType(st, block, x));
                const f = getFunction(st, argTypes, x.expr.id, x.loc);
                x.mangledName = f.mangledName;
                ty = f.type;
            }
            break;
        }
        case NodeType.ArrayExpr: {
            const x = e as A.ArrayExpr;
            const t = getExprType(st, block, x.expr);
            const at = getVar(st, x.expr.id, x.loc).type as GenericType;

            x.args.forEach(a => {
                const ty = getExprType(st, block, a);
                if (!Types.typesMatch(st, ty, KnownTypes.Integer)) Errors.raiseArrayIndexError(a.type, a.loc);
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
                x.args.forEach(y => Types.typesMustMatch(st, et, y.type, y.loc))

                // can infer type from constructor args
                const ty = x.type as GenericType;
                if (!ty.typeParameters) {
                    ty.typeParameters = [et];
                }
                else {
                    Types.typesMustMatch(st, ty.typeParameters[0], et, x.loc);
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
        case NodeType.IfExpr: {
            const x = e as A.IfExpr;
            if (!x.isStmt) ifMustReturn(x.ifBranch);
            if (!x.isStmt) ifMustReturn(x.elseBranch);

            const t = getExprType(st, block, x.condition);
            if (t !== KnownTypes.Bool) Errors.raiseIfConditionError(t, x.loc);

            const st1 = doBlock(st, x.ifBranch);
            const st2 = doBlock(st, x.elseBranch);
            if (st1.as.ret || st2.as.ret) {
                // ignore
            }
            else {
                Types.typesMustMatch(st, x.ifBranch.type, x.elseBranch.type, x.loc);
            }

            x.type = Types.typeNotInferred(x.ifBranch.type) ? KnownTypes.Void: x.ifBranch.type;
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
                        loc: P.NativeLoc,
                    } as GenericType;
                    break;
                }
                default: Errors.raiseTypeError(`Can only acquire reference to lvalues.`, e.loc);
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
                Errors.raiseTypeError(`cannot dereference: ${t.id}`, x.loc);
            }
            break;
        }
        case NodeType.BlockExpr: {
            const x = e as A.BlockExpr;
            doBlock(st, x);
            if (!x.xs.length) Errors.raiseDebug();
            const y = x.xs[x.xs.length -1] as A.ExprStmt;
            if (y.nodeType !== NodeType.ExprStmt) Errors.raiseDebug();
            ty = y.expr.type;
            break;
        }
        case NodeType.GroupExpr: {
            const x = e as A.GroupExpr;
            ty = getExprType(st, block, x.expr);
            break;
        }
        default: Errors.raiseDebug(NodeType[e.nodeType]);
    }
    if (!st.typeExists(ty)) Errors.raiseUnknownType(ty, e.loc);
    if (Types.typeNotInferred(e.type)) {
        e.type = st.getType(ty.id)!;
    }
    updateType(st, e.type);
    return ty;
}

function updateType(st: SymbolTable, t: P.Type) {
    const x = st.getType(t.id);
    if (x && x.native) {
        t.ntype = x.native;
        //console.log(`type: ${t.id}, native: ${JSON.stringify(t.ntype)}`);
    }
    else {
        //console.log(`[undef] type: ${t.id}, native: ${JSON.stringify(t.ntype)}`);
    }
}

function doStmt(st: SymbolTable, block: A.BlockExpr, s: Stmt) {
    switch (s.nodeType) {
        case NodeType.VarInitStmt: {
            const x = s as A.VarInitStmt;

            // infer
            const ty = getExprType(st, block, x.expr);
            if (Types.typeNotInferred(x.var.type)) {
                x.var.type = ty;
            }
            updateType(st, x.var.type);
            // check
            if (!st.typeExists(x.var.type)) Errors.raiseUnknownType(x.var.type, x.var.loc);
            st.addVar(x.var);
            checkTypes(st, block, x.var.type, x.expr, x.loc);
            break;
        }
        case NodeType.VarAssnStmt: {
            const x = s as A.VarAssnStmt;
            // infer
            getExprType(st, block, x.lhs);
            const v = resolveVar(st, x.lhs);

            // check assignments to immutable vars
            if (!v.isMutable) Errors.raiseImmutableVar(v, x.loc);

            checkTypes(st, block, x.lhs, x.rhs, x.loc);
            break;
        }
        case NodeType.ReturnStmt: {
            const x = s as A.ReturnStmt;
            let b = block;
            while (b.parent) {
                b = b.parent;
            }
            getExprType(st, b, x.expr);
            setBlockType(st, b, x.expr);
            st.as.ret = x;
            break;
        }
        case NodeType.ExprStmt: {
            const x = s as A.ExprStmt;
            if (x.expr.nodeType === NodeType.IfExpr) {
                const y = x.expr as A.IfExpr;
                y.isStmt = true;
            }
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
    return st;
}

function doFunctionReturnType(st: SymbolTable, fp: P.FunctionPrototype) {
    if (!st.typeExists(fp.type)) Errors.raiseUnknownType(fp.type, fp.loc);
}

function doFunctionPrototype(st: SymbolTable, fp: P.FunctionPrototype) {
    fp.typeParameters.forEach(x => st.addTypeParameter(x));
    fp.params.forEach(x => {
        if (!st.typeExists(x.type)) Errors.raiseUnknownType(x.type, x.loc);
        st.addVar(x);
    });
}

function doFunction(st: SymbolTable, f: P.Function) {
    if (f.proto.id == "main") f.body.type = KnownTypes.Void;
    st = st.newTable();
    doFunctionPrototype(st, f.proto);
    doBlock(st, f.body);
    f.proto.type = f.body.type;
    if (Types.typeNotInferred(f.proto.type)) f.proto.type = KnownTypes.Void;
}

function doForeignFunction(st: SymbolTable, f: P.ForeignFunction) {
    if (Types.typeNotInferred(f.proto.type)) {
        f.proto.type = KnownTypes.Void;
    }
    st = st.newTable();
    doFunctionPrototype(st, f.proto);
}

function doStruct(st: SymbolTable, s: P.Struct) {
    st.addStruct(s);
    s.typeParameters.forEach(x => st.addTypeParameter(x));
    s.members.forEach(x => {
        if (!st.typeExists(x.type)) Errors.raiseUnknownType(x.type, x.loc);
    })
}

function doTypeDeclaration(st: SymbolTable, t: P.TypeDeclaration) {
    // get struct
    const s = st.getStruct(t.cons.id);
    if (!s) Errors.raiseUnknownType(t.cons, t.loc);
    const ty = st.getType(t.type.id);
    if (!ty) Errors.raiseDebug();

    switch (s.type.id) {
        case NativeTypes.SignedInt.id: {
            const bits = t.params[0] as A.NumberLiteral;
            ty.native = P.nativeInt(bits.value);
            break;
        }
        case NativeTypes.UnsignedInt.id: {
            const bits = t.params[0] as A.NumberLiteral;
            ty.native = P.nativeUint(bits.value);
            break;
        }
        case NativeTypes.Float.id: {
            const bits = t.params[0] as A.NumberLiteral;
            const exponent = t.params[0] as A.NumberLiteral;
            ty.native = P.nativeFloat(bits.value, exponent.value);
            break;
        }
        default: {
            Errors.raiseDebug(s.type.id);
        }
    }
    if (s.members.length != t.params.length) Errors.raiseDebug();

    for (let i = 0; i < s.members.length; i += 1) {
        const a = s.members[i];
        const b = t.params[i];
        Types.typesMustMatch(st, a.type, b.type, b.loc);
    }
}

function doTypeDefinition(st: SymbolTable, t: P.TypeDefinition) {
    if ((t as P.TypeAlias).alias) {+
        st.addTypeDefinition(t);
        const x = t as P.TypeAlias;
        if (!st.typeExists(x.alias)) Errors.raiseUnknownType(x.alias, x.loc);
    }
    else if ((t as P.TypeDeclaration).cons) {
        st.addTypeDefinition(t);
        const x = t as P.TypeDeclaration;
        if (!st.typeExists(x.cons)) Errors.raiseUnknownType(x.cons, x.loc);
        doTypeDeclaration(st, x);
    }
    else {
        Errors.raiseDebug();
    }
}

function checkModule(st: SymbolTable, m: P.Module) {
    Logger.info(`Type checking: ${m.path}`);
    // first add all types
    m.types.forEach(x => st.addType(x.type));
    m.structs.forEach(x => st.addType(x.type));

    // then the rest
    m.structs.forEach(x => doStruct(st, x));
    m.types.forEach(x => doTypeDefinition(st, x));

    for (const x of m.foreignFunctions) {
        st.addFunction(x.proto);
        doForeignFunction(st, x);
    }

    for (const x of m.functions) {
        st.addFunction(x.proto);
        doFunction(st, x);
    }

    // check return types
    for (const x of m.foreignFunctions) {
        doFunctionReturnType(st, x.proto);
    }

    for (const x of m.functions) {
        doFunctionReturnType(st, x.proto);
    }
}

function _check(st: SymbolTable, m: P.Module, map: Dictionary<P.Module>, mods: P.Module[]) {
    if (map[m.id]) return;
    map[m.id] = m;
    st = m.id === P.NativeModule ? st : st.newTable();
    // for each import, perform check
    const imports = mods.filter(x => m.imports.filter(y => x.id === y.id).length);
    for (const im of imports) {
        _check(st, im, map, mods);
        //if (map[im.id]) continue;
        //map[im.id] = im;
        checkModule(st, im);
    }
    checkModule(st, m);
}

function collectAllTypes(st: SymbolTable) {
    const xs = [];
    xs.push(...st.getTypes());
    st.children.forEach(x => xs.push(...collectAllTypes(x)));
    return xs;
}

export default function check(mods: P.Module[]) {
    const global = SymbolTable.build();

    global.addType(NativeTypes.Word);

    const map: Dictionary<P.Module> = {};
    for (const m of mods) {
        _check(global, m, map, mods);
    }

    const types: Dictionary<P.Type> = {};
    collectAllTypes(global).forEach(x => types[x.id] = x);
    return types;
}