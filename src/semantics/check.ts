/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import {
    A,
} from "../parser/mod.ts";
import {
    SymbolTable,
} from "./mod.internal.ts";
import {
    Dictionary,
    Errors,
    Logger, object_entries, object_values,
} from "../util/mod.ts";

type Location = A.Location;
type Type = A.Type;
type Stmt = A.Stmt;
type Expr = A.Expr;
const NodeType = A.NodeType;

function ifMustReturn(be: A.BlockExpr) {
    // last statement must be a return
    const last = be.xs.length ? be.xs[be.xs.length - 1] : undefined;
    if (last) {
        if (last.nodeType === NodeType.ReturnStmt) {
            // ignore
        }
        else if (last.nodeType === NodeType.ExprStmt) {
            const es = (last as A.ExprStmt);
            const e = {
                nodeType: NodeType.LocalReturnExpr,
                expr: es.expr,
                loc: es.loc,
                type: A.Compiler.NotInferred,
            } as A.LocalReturnExpr;
            es.expr = e;
            if (e.expr.nodeType == NodeType.IfExpr) {
                const x = e.expr as A.IfExpr;
                ifMustReturn(x.ifBranch);
                ifMustReturn(x.elseBranch);
            }
        }
        else {
            Errors.Checker.raiseIfExprMustReturn(be.loc);
        }
    }
    else {
        Errors.Checker.raiseIfExprMustReturn(be.loc);
    }
}
/* todo:
function checkTypes(st: SymbolTable, block: A.BlockExpr, le_or_type: Type|Expr, re: Expr, loc: Location) {
    const getType = (e: Expr) => {
        return st.typeNotInferred(e.type) ? doExpr(st, block, e) : e.type;
    }

    const ltype = (le_or_type as Expr).nodeType ? getType(le_or_type as Expr) : le_or_type as Type;
    const rtype = getType(re);

    st.resolver.typesMustMatch(ltype, rtype, loc);
    if (!st.typeExists(ltype)) Errors.Checker.raiseUnknownType(ltype, loc);
}*/

function resolveDereferenceExpr(x: A.DereferenceExpr) {
    while (x.expr.nodeType === NodeType.DereferenceExpr) {
        x = x.expr as A.DereferenceExpr;
    }
    return x;
}

export function resolveVar(st: SymbolTable, e: Expr): A.Variable {
    switch (e.nodeType) {
        case NodeType.IDExpr: {
            const x = e as A.IDExpr;
            return st.getExistingVar(x.id, x.loc);
        }
        case NodeType.ArrayExpr: {
            const x = e as A.ArrayExpr;
            return st.getExistingVar(x.expr.id, x.loc);
        }
        case NodeType.DereferenceExpr: {
            const x = resolveDereferenceExpr(e as A.DereferenceExpr);
            const y = x.expr as A.IDExpr;
            return st.getExistingVar(y.id, y.loc);
        }
        case NodeType.CastExpr: {
            const x = e as A.CastExpr;
            const y = x.expr as A.IDExpr;
            Errors.ASSERT(y.nodeType === NodeType.IDExpr);
            return st.getExistingVar(y.id, x.loc);
        }
        default: Errors.raiseDebug(NodeType[e.nodeType]);
    }
}

function setBlockType(st: SymbolTable, block: A.BlockExpr, expr: Expr) {
    const ty = doExpr(st, block, expr);
    if (st.typeNotInferred(block.type)) {
        block.type = ty;
    }
    else {
        st.resolver.typesMustMatch(block.type, ty, expr.loc);
    }
    return ty;
}

// Array[?](...) -- call
// Person[?](...) -- call
// xs(0) -- array expr
// println[?](q) -- call
// xs.size[?]() -- ufcs
function doApplication(st: SymbolTable, block: A.BlockExpr, x: A.FunctionApplication): Type {
    const isUFCS = x.expr.rest.length && st.varExists(x.expr.id);
    const isCall = !st.varExists(x.expr.id);
    let typeParams: Type[] = [];
    if (isCall) {
        const s = st.getStruct(x.expr.id, x.expr.loc);
        if (!s) {
            // regular function
        }
        else if (s.id === A.Compiler.Array.id) {
            // todo: should ideally be handled by getFunction
            // todo: hold till vararg is implemented correctly
            // is array constructor
            if (!x.args.length) Errors.Checker.raiseArrayInitArgs(x.loc);

            // check arg types
            // get type of first arg
            const et = doExpr(st, block, x.args[0]);
            x.args.forEach(y => st.resolver.typesMustMatch(et, y.type, y.loc))

            // can infer type from constructor args
            if (!x.typeParams.length) {
                x.typeParams = [et];
            }
            else {
                st.resolver.typesMustMatch(x.typeParams[0], et, x.loc);
            }
            if (x.typeParams.length != 1) Errors.Parser.raiseArrayType(x.loc);
            return A.newParametricType(x.expr.id, x.loc, x.typeParams);
        }
        else {
            // type instantiation function
            x.nodeType = NodeType.TypeInstance;
            typeParams = x.typeParams;
        }
    }
    else if (isUFCS) {
        // deconstruct UFCS call
        const fn = x.expr.rest.pop()!;
        const a: A.IDExpr = {
            nodeType: NodeType.IDExpr,
            type: A.Compiler.NotInferred,
            loc: x.expr.loc,
            id: x.expr.id,
            rest: x.expr.rest,
        };
        x.expr.id = fn;
        x.expr.rest = [];
        const xs = [];
        xs.push(a)
        xs.push(...x.args);
        x.args = xs;
        typeParams = x.typeParams;
    }
    else {
        const y = x as A.ArrayExpr;
        y.nodeType = NodeType.ArrayExpr;
        return doExpr(st, block, y);
    }

    const argTypes = x.args.map(y => {
        const t = doExpr(st, block, y);
        t.loc = y.loc;
        return t;
    });
    const f = st.getExistingFunction(typeParams, argTypes, x.expr.id, x.loc);
    const paramTypes = f.params.map(y => y.type);
    if (argTypes.length != paramTypes.length) return Errors.Checker.raiseFunctionParameterCountMismatch(x.type.id, x.loc);
    paramTypes.forEach((y, i) => st.resolver.typesMustMatch(y, argTypes[i], argTypes[i].loc));
    x.mangledName = f.type.mangledName;
    return f.type.returns!;
}

function doExpr(st: SymbolTable, block: A.BlockExpr, e: Expr): Type {
    if (st.as.ret) Errors.Checker.unreachableCode(e.loc);
    let ty;
    switch (e.nodeType) {
        case NodeType.BooleanLiteral: {
            e.type = A.Language.bool;
            ty = e.type;
            break;
        }
        case NodeType.StringLiteral: {
            e.type = A.Language.string;
            ty = e.type;
            break;
        }
        case NodeType.NumberLiteral: {
            e.type = A.Language.u64;
            ty = e.type;
            break;
        }
        case NodeType.IDExpr: {
            const x = e as A.IDExpr;
            ty = st.getExistingVar(x.id, x.loc).type;
            if (!x.rest) Errors.Checker.raiseTypeError(x.id, x.loc);
            if (x.rest.length) {
                // check
                let rest = x.rest.slice();
                while (rest.length) {
                    const y = rest.shift();
                    const s = st.getStruct(ty, x.loc);
                    if (rest.length && !s) return Errors.Checker.raiseUnknownType(ty.id, x.loc);
                    Errors.ASSERT(!!s, ty.id, ty.loc);
                    const ys = s!.params.filter(a => a.id === y);
                    if (!ys.length) return Errors.Checker.raiseUnknownIdentifier(y!, x.loc);
                    ty = ys[0].type;
                }
            }
            break;
        }
        case NodeType.BinaryExpr: {
            const x = e as A.BinaryExpr;

            const ta = doExpr(st, block, x.left);
            const tb = doExpr(st, block, x.right);

            if (x.op === "+" || x.op === "-") {
                if (st.isInteger(ta) && st.isInteger(tb)) {
                    ty = ta;
                }
                else if (st.isInteger(ta) && st.isPointer(tb)) {
                    ty = tb;
                }
                else if (st.isPointer(ta) && st.isInteger(tb)) {
                    ty = ta;
                }
                else {
                    return Errors.Checker.raiseMathTypeError(ta, x.loc);
                }
            }
            else {
                st.resolver.typesMustMatch(ta, tb, x.loc);
                switch (x.op) {
                    case "%":
                    case "*":
                    case "/": {
                        if (!st.isInteger(ta)) return Errors.Checker.raiseMathTypeError(ta, x.loc);
                        ty = ta;
                        break;
                    }
                    case ">":
                    case "<":
                    case ">=":
                    case "<=": {
                        if (!st.isInteger(ta) && !st.isPointer(ta)) return Errors.Checker.raiseMathTypeError(ta, x.loc);
                        ty = A.Language.bool;
                        break;
                    }
                    case "==":
                    case "!=": {
                        ty = A.Language.bool;
                        break;
                    }
                    case "|":
                    case "&": {
                        if (!st.isBoolean(ta)) return Errors.Checker.raiseLogicalOperationError(ta, x.loc);
                        ty = ta;
                        break;
                    }
                    default: return Errors.Checker.error(x.op, x.loc);
                }
            }
            break;
        }
        case NodeType.FunctionApplication: {
            ty = doApplication(st, block, e as A.FunctionApplication);
            break;
        }
        case NodeType.ArrayExpr: {
            const x = e as A.ArrayExpr;
            const t = doExpr(st, block, x.expr);
            st.resolver.basicTypesMustMatch(t, A.Compiler.Array, x.loc);
            const at = st.getExistingVar(x.expr.id, x.loc).type as A.ParametricType;

            x.args.forEach(a => {
                const ty = doExpr(st, block, a);
                if (!st.isInteger(ty)) return Errors.Checker.raiseArrayIndexError(a.type, a.loc);
            });

            ty = at.typeParams[0];
            break;
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

            const t = doExpr(st, block, x.condition);
            if (!st.isBoolean(t)) return Errors.Checker.raiseIfConditionError(t, x.loc);

            const st1 = doBlock(st, "if-body", x.ifBranch);
            const st2 = doBlock(st, "else-body", x.elseBranch);
            if (st1.as.ret || st2.as.ret) {
                // ignore
            }
            else {
                st.resolver.typesMustMatch(x.ifBranch.type, x.elseBranch.type, x.loc);
            }

            x.type = st.typeNotInferred(x.ifBranch.type) ? A.Language.void: x.ifBranch.type;
            ty = x.type;
            break;
        }
        case NodeType.CastExpr: {
            const x = e as A.CastExpr;
            const t = doExpr(st, block, x.expr);
            //todo: if (Types.typesMatch(st, t, x.type)) Errors.raiseTypeError("Unnecessary cast", x.loc);
            ty = x.type;
            break;
        }
        case NodeType.VoidExpr: {
            ty = e.type;
            break;
        }
        case NodeType.ReferenceExpr: {
            const xx = e as A.ReferenceExpr;
            const t = doExpr(st, block, xx.expr);
            const y = xx.expr;
            switch (y.nodeType) {
                case NodeType.IDExpr:
                case NodeType.ArrayExpr: {
                    ty = A.newParametricType(A.Language.ptr.id, y.loc, [t]);
                    break;
                }
                default: return Errors.Checker.raiseTypeError(`Can only acquire reference to lvalues.`, e.loc);
            }
            break;
        }
        case NodeType.DereferenceExpr: {
            const x = e as A.DereferenceExpr;
            const t = doExpr(st, block, x.expr) as A.ParametricType;
            if (t.typeParams.length) {
                ty = t.typeParams[0];
            }
            else {
                return Errors.Checker.raiseTypeError(`cannot dereference: ${t.id}`, x.loc);
            }
            break;
        }
        case NodeType.BlockExpr: {
            const x = e as A.BlockExpr;
            doBlock(st, "block", x);
            if (x.xs.length) {
                const y = x.xs[x.xs.length -1] as A.ExprStmt;
                if (y.nodeType === NodeType.ExprStmt) {
                    ty = A.Language.void;
                }
                else {
                    ty = y.expr.type;
                }
            }
            else {
                ty = A.Language.void;
            }
            break;
        }
        case NodeType.GroupExpr: {
            const x = e as A.GroupExpr;
            ty = doExpr(st, block, x.expr);
            break;
        }
        case NodeType.NegationExpr: {
            const x = e as A.NegationExpr;
            ty = doExpr(st, block, x.expr);
            if (st.isBoolean(ty)) {
                e.nodeType = NodeType.NotExpr;
            }
            else if (st.isBits(ty)) {
                // ignore
            }
            else {
                return Errors.Checker.raiseNegationOperationError(ty, x.loc);
            }
            break;
        }
        default: return Errors.raiseDebug(NodeType[e.nodeType]);
    }
    st.typeMustExist(ty, e.loc);
    if (st.typeNotInferred(e.type)) {
        //todo: e.type = st.getType(ty.id)!;
        e.type = ty;
    }
    return ty;
}

function doStmt(st: SymbolTable, block: A.BlockExpr, s: Stmt) {
    switch (s.nodeType) {
        case NodeType.VarInitStmt: {
            const x = s as A.VarInitStmt;

            // infer
            const ty = doExpr(st, block, x.expr);
            if (st.typeNotInferred(x.var.type)) {
                x.var.type = ty;
            }

            // check
            st.typeMustExist(x.var.type);
            st.addVar(x.var);
            //checkTypes(st, block, x.var.type, x.expr, x.loc);
            break;
        }
        case NodeType.VarAssnStmt: {
            const x = s as A.VarAssnStmt;
            // infer
            const ty = doExpr(st, block, x.lhs);
            const v = resolveVar(st, x.lhs);

            // check assignments to immutable vars
            if (!v.isMutable) return Errors.Checker.raiseImmutableVar(v, x.loc);

            //checkTypes(st, block, x.lhs, x.rhs, x.loc);
            break;
        }
        case NodeType.ReturnStmt: {
            const x = s as A.ReturnStmt;
            let b = block;
            while (b.parent) {
                b = b.parent;
            }
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
            doExpr(st, block, x.expr);
            break;
        }
        case NodeType.ForStmt: {
            const x = s as A.ForStmt;
            st = st.newTable("for", x);

            if (x.init) doStmt(st, block, x.init);
            if (x.condition) {
                const t = doExpr(st, block, x.condition);
                if (!st.isBoolean(t)) return Errors.Checker.raiseForConditionError(t, x.loc);
            }
            if (x.update) doStmt(st, block, x.update);
            doBlock(st,"for-body", x.body);
            break;
        }
        default: Errors.raiseDebug(NodeType[s.nodeType]);
    }
}

function doBlock(st: SymbolTable, label: string, block: A.BlockExpr) {
    st = st.newTable(`block: ${label}`, block);
    block.xs.forEach(y => doStmt(st, block, y));
    return st;
}

function doFunction(st: SymbolTable, f: A.FunctionDef) {
    st = st.newTable(`fn:${f.id}`, f);
    f.type.freeTypeParams.forEach(x => st.addFreeTypeParam(x));
    f.params.forEach(x => {
        st.typeMustExist(x.type);
        st.addVar(x);
    });
    if (f.body) {
        if (f.id == "main") f.body.type = A.Language.void;
        doBlock(st, "fn-body", f.body);
        if (st.typeNotInferred(f.body.type)) f.body.type = A.Language.void;
        f.type.returns = st.typeNotInferred(f.type.returns) ? f.body.type : f.type.returns;
        st.resolver.typesMustMatch(f.type.returns, f.body.type, f.type.returns.loc);
    }
    else {
        if (st.typeNotInferred(f.type.returns)) f.type.returns = A.Language.void;
    }
    st.typeMustExist(f.type.returns);
}

function doTypes(st: SymbolTable, types: A.TypeDef[]) {
    const doAlias = (t: A.TypeAlias) => {
        st.addTypeAlias(t);
        st.typeMustExist(t.alias);
    };

    const doStruct = (s: A.StructType) => {
        st.addStruct(s);
        const old = st;
        st = st.newTable(`struct:${s.id}`);
        s.tag = st;
        s.freeTypeParams.forEach(x => st.addFreeTypeParam(x));
        s.params.forEach(x => st.typeMustExist(x.type));
        st = old;

        // add type instantiation function
        const f = A.newFunctionDef(s.id, s.loc, s.freeTypeParams.map(x => x.id), s, s.params);
        st.addFunction(f);
    };

    for (const t of types) {
        const ta = t as A.TypeAlias;
        const ts = t as A.StructType;

        if (ta.alias) doAlias(ta);
        if (ts.params) doStruct(ts);
    }
}

function doModule(m: A.Module) {
    Logger.info(`Type checking: ${m.path}`);
    const st = m.tag;

    for (const x of m.functions) {
        doFunction(st, x);
    }
}

function doModuleDefinition(st: SymbolTable, m: A.Module, c: Check) {
    if (c.map[m.id]) return;
    c.map[m.id] = m;

    Logger.info(`Type checking [defs]: ${m.path}`);
    const global = st;
    st = st.newTable(m.id);
    m.tag = st;

    // for each import, perform check
    const imports = c.mods.filter(x => m.imports.filter(y => x.id === y.id).length);
    for (const im of imports) {
        st.addImport(im);
        doModuleDefinition(global, im, c);
    }

    doTypes(st, m.types);

    for (const x of m.functions) {
        st.addFunction(x);
    }
    c.xs.push(m);
    Logger.info(`Type checking done [defs]: ${m.path}`);
}

class Check {
    public readonly map: Dictionary<A.Module> = {};
    public readonly xs: A.Module[] = [];

    constructor(public readonly mods: A.Module[]) {}
}

export default function check(mods: A.Module[]) {
    const global = SymbolTable.build(A.NativeModule);

    object_values<A.Type>(A.Language).forEach(x => global.addPrimitiveType(x));

    const c = new Check(mods);
    for (const m of mods) {
        if (m.id === A.NativeModule) {
            c.map[m.id] = m;
            continue;
        }
        m.imports = [{id: A.NativeModule, loc: A.NativeLoc}].concat(...m.imports);
        doModuleDefinition(global, m, c);
    }

    for (const m of c.xs) {
        doModule(m);
    }

    return global;
}