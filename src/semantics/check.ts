/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import {
    Location,
    Block,
    Expr,
    NodeType,
    BlockExpr, TypeParamRef, TypeSpecRef, VarSpecRef, TypeRef,
    NativeModule,
    DerefExpr,
    VarSpec,
    IfExpr,
    ModuleDef,
    StructDef,
    TypeConsExpr,
    TypeAliasExpr,
    FunctionDef,
    ForExpr,
    ReturnExpr,
    VarInitExpr,
    VarAssnExpr,
    GroupExpr,
    RefExpr,
    node_str,
    CastExpr,
    LocalReturnExpr,
    ArrayExpr,
    FunctionApplication,
    IDExpr,
    BinaryExpr,
} from "../parser/mod.ts";
import {
    Dictionary,
    Errors,
    Logger,
} from "../driver/mod.ts";

type BlockScope = Block|BlockExpr;
function checkTypes(block: BlockScope, le_or_type: TypeRef|Expr, re: Expr, loc: Location) {
    const getType = (e: Expr) => {
        return block.typeNotInferred(e.type) ? doExprType(block, e) : e.type;
    }

    const ltype = (le_or_type as Expr).nodeType ? getType(le_or_type as Expr) : le_or_type as TypeRef;
    const rtype = getType(re);

    block.typesMustMatch(ltype, rtype, loc);
    if (!block.typeExists(ltype, loc)) Errors.Checker.raiseUnknownType(ltype, loc);
}

function getVar(block: BlockScope, ref: VarSpecRef, loc?: Location) {
    const x = block.getVar(ref);
    loc = loc || x!.loc;
    if (!x) return Errors.Checker.raiseUnknownIdentifier("id", loc);
    return x;
}

function resolveDereferenceExpr(x: DerefExpr) {
    while (x.expr.nodeType === NodeType.DereferenceExpr) {
        x = x.expr as DerefExpr;
    }
    return x;
}

export function resolveVar(block: BlockScope, e: Expr): VarSpec {
    switch (e.nodeType) {
        case NodeType.IDExpr: {
            const x = e as IDExpr;
            return getVar(block, x.id, x.loc);
        }
        case NodeType.ArrayExpr: {
            const x = e as ArrayExpr;
            return getVar(block, x.expr.id, x.expr.loc);
        }
        case NodeType.DereferenceExpr: {
            const x = resolveDereferenceExpr(e as DerefExpr);
            const y = x.expr as IDExpr;
            return getVar(block, y.id, y.loc);
        }
        case NodeType.CastExpr: {
            const x = e as CastExpr;
            const y = x.expr as IDExpr;
            Errors.ASSERT(y.nodeType === NodeType.IDExpr);
            return getVar(block, y.id, y.loc);
        }
        default: Errors.notImplemented(node_str(e.nodeType));
    }
}

/*
function ifMustReturn(block: BlockScope) {
    // last statement must be a return
    const last = block.body.length ? block.body[block.body.length - 1] : undefined;
    if (last) {
        if (last.nodeType === NodeType.ReturnExpr) {
            // ignore
        }
        else {
            const es = last as Expr;
            const e = block.addLocalReturnExpr(es.loc, es);
            block.body[block.body.length - 1] = e;
            if (e.expr.nodeType == NodeType.IfExpr) {
                const x = e.expr as IfExpr;
                ifMustReturn(x.ifBranch);
                ifMustReturn(x.elseBranch);
            }
            //Errors.Checker.raiseIfExprMustReturn(block.loc);
        }
    }
    else {
        Errors.Checker.raiseIfExprMustReturn(block.loc);
    }
}

function getFunction(block: BlockScope, typeParams: TypeParamRef[], argTypes: TypeSpecRef[], id: string, loc: Location): FunctionDef {
    const x = block.getFunction(id, loc, typeParams, argTypes);
    if (!x) return Errors.Checker.raiseUnknownFunction(`${id}(${argTypes.map(x => Types.toTypeString(x)).join(", ")})`, loc);
    return x;
}

function getStruct(block: BlockScope, t: TypeRef, loc: Location): FunctionDef {
    const x = block.getStruct(t.id, loc, t.typeParams, t.takes);
    if (!x) return Errors.Checker.raiseUnknownType(t.id, loc);
    return x;
}

function setBlockType(block: BlockScope, expr: Expr) {
    const ty = doExprType(block, expr);
    if (block.typeNotInferred(block.type)) {
        block.type = ty;
    }
    else {
        block.typesMustMatch(block.type, ty, expr.loc);
    }
    return ty;
}

// Array[?](...) -- call
// Person[?](...) -- call
// xs(0) -- array expr
// println[?](q) -- call
// xs.size[?]() -- ufcs
function doApplication(block: BlockScope, x: FunctionApplication): TypeRef {
    const isUFCS = x.expr.rest.length && st.varExists(x.expr.id);
    const isCall = !block.varExists(x.expr.id);
    let typeParams: TypeRef[] = [];
    if (isCall) {
        const s = block.getStruct(x.expr.id);
        if (!s) {
            // regular function
        }
        else if (s.id === Types.Array) {
            // todo: should ideally be handled by getFunction
            // todo: hold till vararg is implemented correctly
            // is array constructor
            if (!x.args.length) Errors.Checker.raiseArrayInitArgs(x.loc);

            // check arg types
            // get type of first arg
            const et = doExprType(block, x.args[0]);
            x.args.forEach(y => block.typesMustMatch(y.type, et))

            // can infer type from constructor args
            if (!x.typeParams.length) {
                x.typeParams = [et];
            }
            else {
                block.typesMustMatch(x.typeParams[0], et, x.loc);
            }
            if (x.typeParams.length != 1) Errors.Parser.raiseArrayType(x.loc);
            return Types.newType(x.expr.id, x.loc, x.typeParams);
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
        const a: IDExpr = {
            nodeType: NodeType.IDExpr,
            type: Types.Compiler.NotInferred,
            loc: x.expr.loc,
            id: x.expr.id,
            resc: x.expr.rest,
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
        const y = x as ArrayExpr;
        y.nodeType = NodeType.ArrayExpr;
        return doExprType(block, y);
    }

    const argTypes = x.args.map(y => {
        const t = doExprType(block, y);
        t.loc = y.loc;
        return t;
    });
    const f = getFunction(block, typeParams, argTypes, x.expr.id, x.loc);
    const paramTypes = f.params.map(y => y.type);
    if (argTypes.length != paramTypes.length) return Errors.Checker.raiseFunctionParameterCountMismatch(x.type.id, x.loc);
    paramTypes.forEach((y, i) => block.typesMustMatch(argTypes[i], y));
    x.mangledName = f.mangledName;
    return f.returns!;
}
*/
function doExprType(block: BlockScope, e: Expr): TypeRef {
    //if (st.as.ret) Errors.Checker.unreachableCode(e.loc);
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
            ty = getVar(block, x.id, x.loc).type;
            /*if (!x.rest) Errors.Checker.raiseTypeError(x.id, x.loc);
            if (x.rest.length) {
                // check
                let rest = x.rest.slice();
                while (rest.length) {
                    const y = rest.shift();
                    const s = getStruct(block, ty, x.loc);
                    if (!s)  {
                        if (rest.length) return Errors.notImplemented(ty.id);
                    }
                    else {
                        const ys = s.params.filter(a => a.id === y);
                        if (!ys.length) return Errors.notImplemented(y);
                        ty = ys[0].type;
                    }
                }
            }*/
            break;
        }
        case NodeType.BinaryExpr: {
            const x = e as BinaryExpr;

            const ta = doExprType(block, x.left);
            const tb = doExprType(block, x.right);
            block.typesMustMatch(ta, tb, x.loc);

            switch (x.op) {
                case "%":
                case "*":
                case "/":
                case "+":
                case "-": {
                    if (!block.isInteger(ta)) return Errors.Checker.raiseMathTypeError(ta, x.loc);
                    ty = ta;
                    break;
                }
                case ">":
                case "<":
                case ">=":
                case "<=": {
                    if (!block.isInteger(ta)) return Errors.Checker.raiseMathTypeError(ta, x.loc);
                    ty = Block.CompilerTypes.BoolLiteral;
                    break;
                }
                case "==":
                case "!=": {
                    ty = Block.CompilerTypes.BoolLiteral
                    break;
                }
                case "|":
                case "&": {
                    if (!block.isBoolean(ta)) return Errors.Checker.raiseLogicalOperationError(ta, x.loc);
                    ty = ta;
                    break;
                }
                default: return Errors.Checker.error(x.op, x.loc);
            }
            break;
        }/*
        case NodeType.FunctionApplication: {
            ty = doApplication(block, e as FunctionApplication);
            break;
        }
        case NodeType.ArrayExpr: {
            const x = e as ArrayExpr;
            const t = doExprType(block, x.expr);
            block.typesMustMatch(t, Block.CompilerTypes.Array, x.loc);
            const at = getVar(block, x.expr.id, x.expr.loc).type;

            x.args.forEach(a => {
                const ty = doBlock(block, a);
                if (!block.isInteger(ty)) return Errors.Checker.raiseArrayIndexError(a.type, a.loc);
            });

            ty = at.typeParams[0];
            break;
        }
        case NodeType.LocalReturnExpr: {
            const x = e as LocalReturnExpr;
            ty = setBlockType(block, x.expr);
            break;
        }
        case NodeType.IfExpr: {
            const x = e as IfExpr;
            if (!x.isStmt) ifMustReturn(x.ifBranch);
            if (!x.isStmt) ifMustReturn(x.elseBranch);

            const t = doBlock(block, x.condition);
            if (!block.isBoolean(t)) return Errors.Checker.raiseIfConditionError(t, x.loc);

            const st1 = doBlock(x.ifBranch);
            const st2 = doBlock(x.elseBranch);
            if (st1.as.ret || st2.as.ret) {
                // ignore
            }
            else {
                block.typesMustMatch(x.ifBranch.type, x.elseBranch.type, x.loc);
            }

            x.type = block.typeNotInferred(x.ifBranch.type) ? Block.LanguageTypes.Void: x.ifBranch.type;
            ty = x.type;
            break;
        }
        case NodeType.CastExpr: {
            const x = e as CastExpr;
            const t = doExprType(block, x.expr);
            //todo: if (Types.typesMatch(st, t, x.type)) Errors.raiseTypeError("Unnecessary cast", x.loc);
            ty = x.type;
            break;
        }
        case NodeType.VoidExpr: {
            ty = e.type;
            break;
        }
        case NodeType.ReferenceExpr: {
            const xx = e as RefExpr;
            const t = doExprType(block, xx.expr);
            const y = xx.expr;
            switch (y.nodeType) {
                case NodeType.IDExpr:
                case NodeType.ArrayExpr: {
                    ty = Types.newType(Types.Pointer, y.loc, [t]);
                    break;
                }
                default: return Errors.Checker.raiseTypeError(`Can only acquire reference to lvalues.`, e.loc);
            }
            break;
        }
        case NodeType.DereferenceExpr: {
            const x = e as DerefExpr;
            const t = doExprType(block, x.expr);
            if (t.typeParams.length) {
                ty = t.typeParams[0];
            }
            else {
                return Errors.Checker.raiseTypeError(`cannot dereference: ${t.id}`, x.loc);
            }
            break;
        }*/
        case NodeType.BlockExpr: {
            const x = e as BlockExpr;
            doBlock(x);
            if (x.body.length) {
                const y = x.body[x.body.length -1];
                ty = y.type;
            }
            else {
                ty = Block.LanguageTypes.Void;
            }
            break;
        }
        case NodeType.GroupExpr: {
            const x = e as GroupExpr;
            ty = doExprType(block, x.expr);
            break;
        }
        default: return Errors.notImplemented(node_str(e.nodeType));
    }
    block.typeMustExist(ty, e.loc);
    if (block.typeNotInferred(e.type)) {
        //todo: e.type = st.getType(ty.id)!;
        e.type = ty;
    }
    return ty;
}

function doStmt(block: BlockScope, s: Expr) {
    switch (s.nodeType) {
        case NodeType.VarInitExpr: {
            const x = s as VarInitExpr;
            const v = getVar(block, x.var);

            // infer
            const ty = doExprType(block, x.expr);
            if (block.typeNotInferred(v.type)) v.type = ty;

            // check
            block.typeMustExist(v.type);
            checkTypes(block, v.type, x.expr, x.loc);
            break;
        }
        case NodeType.VarAssnExpr: {
            const x = s as VarAssnExpr;
            // infer
            const ty = doExprType(block, x.lhs);
            const v = resolveVar(block, x.lhs);

            // check assignments to immutable vars
            if (!v.isMutable) return Errors.Checker.raiseImmutableVar(v, x.loc);

            checkTypes(block, x.lhs, x.rhs, x.loc);
            break;
        }/*
        case NodeType.ReturnExpr: {
            const x = s as ReturnExpr;
            let b = block;
            while (b.parent) {
                b = b.parent;
            }
            setBlockType(b, x.expr);
            break;
        }
        case NodeType.ForExpr: {
            const x = s as ForExpr;

            if (x.init) doStmt(block, x.init);
            if (x.cond) {
                const t = doExprType(block, x.cond);
                if (!block.isBoolean(t)) return Errors.Checker.raiseForConditionError(t, x.loc);
            }
            if (x.update) doStmt(block, x.update);
            doBlock(x);
            break;
        }*/
        default: Errors.notImplemented(node_str(s.nodeType));
    }
}

function doBlock(block: BlockScope) {
    block.body.forEach(y => doStmt(block, y));
    return block.body.length ? block.body[block.body.length - 1].type : Block.LanguageTypes.Void;
}

function doVar(block: BlockScope, r: VarSpecRef) {
    const v = block.vars[r.hash] as VarSpec;
    block.typeMustExist(v.type);
}

function doFunction(block: FunctionDef) {
    block.params.forEach(x => doVar(block, x));
    block.returns = doBlock(block);
    if (block.resolveID(block.id) === "main") block.typesMustMatch(block.returns, Block.LanguageTypes.Void);
    if (block.typeNotInferred(block.returns)) block.returns = Block.LanguageTypes.Void;
    block.typeMustExist(block.returns!);
}

function doTypes(block: Block) {
    const doType = (t: TypeAliasExpr|TypeConsExpr) => {
        switch (t.nodeType) {
            case NodeType.TypeAliasDef: {
                const x = t as TypeAliasExpr;
                block.typeMustExist(x.type);
                break;
            }
            case NodeType.TypeConsDef: {
                const x = t as TypeConsExpr;
                block.typeMustExist(x.type);
                doTypeCons(x);
                break;
            }
            default: Errors.notImplemented();
        }
    };

    const doTypeCons = (t: TypeConsExpr) => {
        // get struct
        let s = block.getStruct(t.type);
        if (!s) Errors.Checker.raiseUnknownType(t.type, t.loc);
        Errors.ASSERT(s !== undefined);
        Errors.ASSERT(s.params.length == t.args.length, s.resolveID(s.id));

        for (let i = 0; i < s.params.length; i += 1) {
            const v = getVar(s, s.params[i]);
            const a = t.args[i];
            block.typesMustMatch(a.type, v.type);
        }

        /*switch (t.type.typetype) {
            case Block.LanguageTypes.SignedInt:
            case Block.LanguageTypes.UnsignedInt:
            case Block.LanguageTypes.Float: {
                t.type.id = `${t.type.typetype}^${t.args.map(x => x.value).join("|")}`;
                break;
            }
            default: Errors.notImplemented(t.type.typetype);
        }*/
    };

    const doStruct = (s: StructDef) => s.params.forEach(x => doVar(block, x));

    block.listTypes().forEach(x => doType(x));
    block.listStructs().forEach(x => doStruct(x));
}

function doModule(block: ModuleDef) {
    Logger.info(`Type checking: ${block.path}`);

    for (const x of block.listFunctions()) {
        doFunction(x);
    }
}

function doModuleDefinition(global: Block, m: ModuleDef, c: Check) {
    if (c.map[m.id.hash]) return;
    c.map[m.id.hash] = m;

    Logger.info(`Type checking [defs]: ${m.path}`);

    // for each import, perform check
    const imports = c.mods.filter(x => m.imports[x.id.hash]);
    for (const im of imports) {
        doModuleDefinition(global, im, c);
    }

    doTypes(m);

    c.xs.push(m);
    Logger.info(`Type checking done [defs]: ${m.path}`);
}

class Check {
    public readonly map: Dictionary<ModuleDef> = {};
    public readonly xs: ModuleDef[] = [];

    constructor(public readonly mods: ModuleDef[]) {}
}

export function check(global: Block, mods: ModuleDef[]) {
    const processModule = (m: ModuleDef) => {
        if (m.resolveID(m.id) === NativeModule) {
            c.map[m.id.hash] = m;
            return true;
        } else {
            return false;
        }
    };

    const c = new Check(mods);
    for (const m of mods) {
        if (!processModule(m)) continue;
        doModuleDefinition(global, m, c);
    }

    for (const m of c.xs) {
        doModule(m);
    }
}