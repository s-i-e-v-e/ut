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

type Type = P.Type;
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
        Errors.Checker.raiseIfExprMustReturn(be.loc);
    }
}

function checkTypes(st: SymbolTable, block: A.BlockExpr, le_or_type: Type|Expr, re: Expr, loc: Location) {
    const getType = (e: Expr) => {
        return Types.typeNotInferred(e.type) ? getExprType(st, block, e) : e.type;
    }

    const ltype = (le_or_type as Expr).nodeType ? getType(le_or_type as Expr) : le_or_type as Type;
    const rtype = getType(re);

    Types.typesMustMatch(st, ltype, rtype, loc);
    if (!Types.typeExists(st, ltype, loc)) Errors.Checker.raiseUnknownType(ltype, loc);
}

function getVar(st: SymbolTable, id: string, loc: Location) {
    const x = st.getVar(id);
    if (!x) return Errors.Checker.raiseUnknownIdentifier(id, loc);
    return x;
}

function resolveDereferenceExpr(x: A.DereferenceExpr) {
    while (x.expr.nodeType === NodeType.DereferenceExpr) {
        x = x.expr as A.DereferenceExpr;
    }
    return x;
}

export function resolveVar(st: SymbolTable, e: Expr): P.Variable {
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
            Errors.ASSERT(y.nodeType === NodeType.IDExpr);
            return getVar(st, y.id, x.loc);
        }
        default: Errors.raiseDebug(NodeType[e.nodeType]);
    }
}

function getFunction(st: SymbolTable, argTypes: Type[], id: string, loc: Location): P.FunctionPrototype {
    const f = st.getFunction(id, argTypes, loc);
    if (!f) return Errors.Checker.raiseUnknownFunction(`${id}(${argTypes.map(x => x.id).join(", ")})`, loc);
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

// Array[?](...) -- call
// Person[?](...) -- call
// xs(0) -- array expr
// println[?](q) -- call
// xs.size[?]() -- ufcs
function doApplication(st: SymbolTable, block: A.BlockExpr, x: A.FunctionApplication): Type {
    const isUFCS = x.expr.rest.length && st.varExists(x.expr.id);
    const isCall = !st.varExists(x.expr.id);
    if (isCall) {
        const s = st.getStruct(x.expr.id);
        if (!s) {
            // regular function
        }
        else if (s.id === P.Types.Array) {
            // todo: should ideally be handled by getFunction
            // todo: hold till vararg is implemented correctly
            // is array constructor
            if (!x.args.length) Errors.Checker.raiseArrayInitArgs(x.loc);

            // check arg types
            // get type of first arg
            const et = getExprType(st, block, x.args[0]);
            x.args.forEach(y => Types.typesMustMatch(st, et, y.type, y.loc))

            // can infer type from constructor args
            if (!x.typeParams.length) {
                x.typeParams = [et];
            }
            else {
                Types.typesMustMatch(st, x.typeParams[0], et, x.loc);
            }
            if (x.typeParams.length != 1) Errors.Parser.raiseArrayType(x.loc);
            return P.Types.newType(x.expr.id, x.loc, x.typeParams);
        }
        else {
            // type instantiation function
            x.nodeType = NodeType.TypeInstance;
        }
    }
    else if (isUFCS) {
        // deconstruct UFCS call
        const fn = x.expr.rest.pop()!;
        const a: A.IDExpr = {
            nodeType: NodeType.IDExpr,
            type: P.Types.Compiler.NotInferred,
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
    }
    else {
        const y = x as A.ArrayExpr;
        y.nodeType = NodeType.ArrayExpr;
        return getExprType(st, block, y);
    }

    const argTypes = x.args.map(y => {
        const t = getExprType(st, block, y);
        t.loc = y.loc;
        return t;
    });
    const f = getFunction(st, argTypes, x.expr.id, x.loc);
    const paramTypes = f.params.map(y => y.type);
    if (argTypes.length != paramTypes.length) return Errors.Checker.raiseFunctionParameterCountMismatch(x.type.id, x.loc);
    paramTypes.forEach((y, i) => Types.typesMustMatch(st, y, argTypes[i], argTypes[i].loc));
    x.mangledName = f.mangledName;
    return f.type;
}

function getExprType(st: SymbolTable, block: A.BlockExpr, e: Expr): Type {
    if (st.as.ret) Errors.Checker.unreachableCode(e.loc);
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
            if (!x.rest) Errors.Checker.raiseTypeError(x.id, x.loc);
            if (x.rest.length) {
                // check
                let rest = x.rest.slice();
                while (rest.length) {
                    const y = rest.shift();
                    //const s = st.getStruct(ty.id);
                    const s = getFunction(st, ty.typeParams, ty.id, x.loc);
                    if (!s)  {
                        if (rest.length) return Errors.raiseDebug(ty.id);
                    }
                    else {
                        const ys = s.params.filter(a => a.id === y);
                        if (!ys.length) return Errors.raiseDebug(y);
                        ty = ys[0].type;
                    }
                }
            }
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
                    if (!Types.isInteger(st, ta)) return Errors.Checker.raiseMathTypeError(ta, x.loc);
                    ty = ta;
                    break;
                }
                case ">":
                case "<":
                case ">=":
                case "<=": {
                    if (!Types.isInteger(st, ta)) return Errors.Checker.raiseMathTypeError(ta, x.loc);
                    ty = P.Types.Compiler.Bool;
                    break;
                }
                case "==":
                case "!=": {
                    ty = P.Types.Compiler.Bool;
                    break;
                }
                case "|":
                case "&": {
                    if (!Types.isBoolean(st, ta)) return Errors.Checker.raiseLogicalOperationError(ta, x.loc);
                    ty = ta;
                    break;
                }
                default: return Errors.Checker.error(x.op, x.loc);
            }
            break;
        }
        case NodeType.FunctionApplication: {
            ty = doApplication(st, block, e as A.FunctionApplication);
            break;
        }
        case NodeType.ArrayExpr: {
            const x = e as A.ArrayExpr;
            const t = getExprType(st, block, x.expr);
            Types.typesMustMatch(st, t, P.Types.Compiler.Array, x.loc);
            const at = getVar(st, x.expr.id, x.loc).type;

            x.args.forEach(a => {
                const ty = getExprType(st, block, a);
                if (!Types.isInteger(st, ty)) return Errors.Checker.raiseArrayIndexError(a.type, a.loc);
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

            const t = getExprType(st, block, x.condition);
            if (!Types.isBoolean(st, t)) return Errors.Checker.raiseIfConditionError(t, x.loc);

            const st1 = doBlock(st, "if-body", x.ifBranch);
            const st2 = doBlock(st, "else-body", x.elseBranch);
            if (st1.as.ret || st2.as.ret) {
                // ignore
            }
            else {
                Types.typesMustMatch(st, x.ifBranch.type, x.elseBranch.type, x.loc);
            }

            x.type = Types.typeNotInferred(x.ifBranch.type) ? P.Types.Compiler.Void: x.ifBranch.type;
            ty = x.type;
            break;
        }
        case NodeType.CastExpr: {
            const x = e as A.CastExpr;
            const t = getExprType(st, block, x.expr);
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
            const t = getExprType(st, block, xx.expr);
            const y = xx.expr;
            switch (y.nodeType) {
                case NodeType.IDExpr:
                case NodeType.ArrayExpr: {
                    ty = P.Types.newType(P.Types.Pointer, y.loc, [t]);
                    break;
                }
                default: return Errors.Checker.raiseTypeError(`Can only acquire reference to lvalues.`, e.loc);
            }
            break;
        }
        case NodeType.DereferenceExpr: {
            const x = e as A.DereferenceExpr;
            const t = getExprType(st, block, x.expr);
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
        default: return Errors.raiseDebug(NodeType[e.nodeType]);
    }
    st.typeMustExist(ty, e.loc);
    if (Types.typeNotInferred(e.type)) {
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
            const ty = getExprType(st, block, x.expr);
            if (Types.typeNotInferred(x.var.type)) {
                x.var.type = ty;
            }

            // check
            st.typeMustExist(x.var.type);
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
            if (!v.isMutable) return Errors.Checker.raiseImmutableVar(v, x.loc);

            checkTypes(st, block, x.lhs, x.rhs, x.loc);
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
            getExprType(st, block, x.expr);
            break;
        }
        case NodeType.ForStmt: {
            const x = s as A.ForStmt;
            st = st.newTable("for", x);

            if (x.init) doStmt(st, block, x.init);
            if (x.condition) {
                const t = getExprType(st, block, x.condition);
                if (!Types.isBoolean(st, t)) return Errors.Checker.raiseForConditionError(t, x.loc);
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

function doFunctionReturnType(st: SymbolTable, fp: P.FunctionPrototype) {
    st.typeMustExist(fp.type);
}

function doFunctionPrototype(st: SymbolTable, fp: P.FunctionPrototype) {
    fp.typeParams.forEach(x => st.addTypeParameter(x));
    fp.params.forEach(x => {
        st.typeMustExist(x.type);
        st.addVar(x);
    });
}

function doFunction(st: SymbolTable, f: P.FunctionDef) {
    if (f.id == "main") f.body.type = P.Types.Compiler.Void;
    st = st.newTable(`fn:${f.id}`, f);
    doFunctionPrototype(st, f);
    doBlock(st, "fn-body", f.body);
    f.type = f.body.type;
    if (Types.typeNotInferred(f.type)) f.type = P.Types.Compiler.Void;
}

function doForeignFunction(st: SymbolTable, f: P.ForeignFunctionDef) {
    if (Types.typeNotInferred(f.type)) {
        f.type = P.Types.Compiler.Void;
    }
    st = st.newTable(`ffn:${f.id}`, f);
    doFunctionPrototype(st, f);
}

function doTypes(st: SymbolTable, xs: P.TypeDecl[], ys: P.StructDef[]) {
    const doTypeDecl = (t: P.TypeDecl) => {
        st.addTypeDecl(t);
        if ((t as P.TypeAliasDef).isAlias) {
            const x = t as P.TypeAliasDef;
            st.typeMustExist(x.type);
        }
        else if ((t as P.TypeDef).isDef) {
            const x = t as P.TypeDef;
            st.typeMustExist(x.type);
            doTypeDef(x);
        }
        else {
            Errors.raiseDebug(t.type.id);
        }
    };

    const doTypeDef = (t: P.TypeDef) => {
        // get struct
        let s = st.getStruct(t.type.id);
        if (!s) {
            s = ys.filter(y => y.type.id === t.type.id)[0];
            if (!s) Errors.Checker.raiseUnknownType(t.type, t.loc);
            doStruct(s);
        }
        Errors.ASSERT(s.params.length == t.args.length, s.type.id);

        for (let i = 0; i < s.params.length; i += 1) {
            const p = s.params[i];
            const a = t.args[i];
            Types.typesMustMatch(st, p.type, a.type, a.loc);
        }

        switch (t.type.typetype) {
            case P.Types.SignedInt:
            case P.Types.UnsignedInt:
            case P.Types.Float: {
                t.type.id = `${t.type.typetype}^${t.args.map(x => x.value).join("|")}`;
                break;
            }
            default: Errors.raiseDebug(t.type.typetype);
        }
    };

    const doStruct = (s: P.StructDef) => {
        if (!st.getStruct(s.type.id)) st.addStruct(s);
        const old = st;
        st = st.newTable(`struct:${s.id}`);
        s.typeParams.forEach(x => st.addTypeParameter(x));
        s.params.forEach(x => st.typeMustExist(x.type));
        st = old;
    };

    ys.forEach(x => st.addType(x.type));
    xs.forEach(x => doTypeDecl(x));
    ys.forEach(x => doStruct(x));
}

function doModule(m: P.Module) {
    Logger.info(`Type checking: ${m.path}`);
    const st = m.tag;

    for (const x of m.functions) {
        doFunction(st, x);
    }

    // check return types
    for (const x of m.foreignFunctions) {
        doFunctionReturnType(st, x);
    }

    for (const x of m.functions) {
        doFunctionReturnType(st, x);
    }
}

function doModuleDefinition(st: SymbolTable, m: P.Module, c: Check) {
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

    doTypes(st, m.types, m.structs);

    for (const x of m.foreignFunctions) {
        st.addFunction(x);
        doForeignFunction(st, x);
    }

    for (const x of m.functions) {
        st.addFunction(x);
    }
    c.xs.push(m);
    Logger.info(`Type checking done [defs]: ${m.path}`);
}

class Check {
    public readonly map: Dictionary<P.Module> = {};
    public readonly xs: P.Module[] = [];

    constructor(public readonly mods: P.Module[]) {}
}

export default function check(mods: P.Module[]) {
    const global = SymbolTable.build(P.Types.NativeModule);

    global.addType(P.Types.Compiler.Word);

    const c = new Check(mods);
    for (const m of mods) {
        if (m.id === P.Types.NativeModule) {
            c.map[m.id] = m;
            continue;
        }
        m.imports = [{id: P.Types.NativeModule, loc: P.Types.NativeLoc}].concat(...m.imports);
        doModuleDefinition(global, m, c);
    }

    for (const m of c.xs) {
        doModule(m);
    }

    return global;
}