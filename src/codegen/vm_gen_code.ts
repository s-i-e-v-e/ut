/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import {
    P,
    A,
} from "../parser/mod.ts";
import {
    ByteBuffer,
    VmCodeBuilder
} from "../vm/mod.ts";
import {
    Dictionary,
    Errors,
    Logger,
} from "../util/mod.ts";
import {
    Allocator,
    Store,
    StructState,
} from "./mod.ts";
const NodeType = A.NodeType;
type Expr = A.Expr;
type Stmt = A.Stmt;

function derefer(store: Store, r: Store) {
    if (store.isWrite) {
        if (store.isValue) {
            store.write_deref(r);
        }
        else {
            store.write_reg(r);
        }
    }
    else {
        if (store.isRHS) {
            if (store.isValue) {
                r.write_deref(store);
            }
            else {
                r.write_reg(store);
            }
        }
        else {
            if (store.isValue) {
                r.write_reg_to_deref(store);
            }
            else {
                r.write_reg(store);
            }
        }
    }
}



function computeStructInfo(ss: StructState, block: A.BlockExpr, v: P.Variable, id: string) {
    const s = block.tag.getStruct(v.type.id);
    if (!s)  {
        const x = {
            offset: ss.offset,
            size: v.type.native.bits/8,
        };
        ss.xs[ss.index] = x;
        ss.map[id] = ss.index;
        ss.offset += x.size;
        ss.index += 1;
    }
    else {
        for (let i = 0; i < s.members.length; i += 1) {
            const m = s.members[i];
            const mid = `${id}.${m.id}`;
            computeStructInfo(ss, block, m, mid);
        }
    }
}

function emitExpr(ac: Allocator, store: Store, block: A.BlockExpr, e: Expr) {
    switch (e.nodeType) {
        case NodeType.BooleanLiteral: {
            const x = e as A.BooleanLiteral;
            store.write_imm(x.value ? 1n : 0n);
            break;
        }
        case NodeType.StringLiteral: {
            const x = e as A.StringLiteral;
            store.write_str(x.value);
            break;
        }
        case NodeType.NumberLiteral: {
            const x = e as A.NumberLiteral;
            store.write_imm(x.value);
            break;
        }
        case NodeType.BinaryExpr: {
            const x = e as A.BinaryExpr;

            const t1 = ac.tmp();
            const t2 = ac.tmp();
            emitExpr(ac, t1, block, x.left);
            emitExpr(ac, t2, block, x.right);

            switch (x.op) {
                case "*": {
                    ac.b.mul_r_r(t1.reg, t2.reg);
                    break;
                }
                case "/": {
                    ac.b.div_r_r(t1.reg, t2.reg);
                    break;
                }
                case "%": {
                    ac.b.mod_r_r(t1.reg, t2.reg);
                    break;
                }
                case "+": {
                    ac.b.add_r_r(t1.reg, t2.reg);
                    break;
                }
                case "-": {
                    ac.b.sub_r_r(t1.reg, t2.reg);
                    break;
                }
                case "==": {
                    ac.b.cmp_r_r(t1.reg, t2.reg);
                    ac.b.sete(t1.reg);
                    break;
                }
                case "!=": {
                    ac.b.cmp_r_r(t1.reg, t2.reg);
                    ac.b.setne(t1.reg);
                    break;
                }
                case "&": {
                    ac.b.and_r_r(t1.reg, t2.reg);
                    break;
                }
                case "|": {
                    ac.b.or_r_r(t1.reg, t2.reg);
                    break;
                }
                case "<": {
                    ac.b.cmp_r_r(t1.reg, t2.reg);
                    ac.b.setlt(t1.reg);
                    break;
                }
                case ">": {
                    ac.b.cmp_r_r(t1.reg, t2.reg);
                    ac.b.setgt(t1.reg);
                    break;
                }
                case "<=": {
                    ac.b.cmp_r_r(t1.reg, t2.reg);
                    ac.b.setle(t1.reg);
                    break;
                }
                case ">=": {
                    ac.b.cmp_r_r(t1.reg, t2.reg);
                    ac.b.setge(t1.reg);
                    break;
                }
                default: Errors.raiseDebug(x.op);
            }

            store.write_reg(t1);
            t1.free();
            t2.free();
            break;
        }
        case NodeType.FunctionApplication: {
            const x = e as A.FunctionApplication;

            // push used regs to stack
            const saved = ac.save();

            // put args in  r1 ... rN
            for (let i = 0; i < x.args.length; i += 1) {
                const r = ac.from(`r${i+1}`);
                emitExpr(ac, r, block, x.args[i]);
            }
            ac.b.call(x.mangledName!);

            // pop used regs from stack
            ac.restore(saved);

            store.write_reg(ac.from("r0"));
            break;
        }
        case NodeType.ArrayConstructor: {
            const x = e as A.ArrayConstructor;
            const ty = block.tag.getType(x.type.typeParams[0]) || x.type.typeParams[0];
            const args = x.args!;
            const n = args.length;
            const entrySizeInBytes = 8;//ty.native.bits/8;
            const bufferSize = entrySizeInBytes*args.length;

            const bb = ByteBuffer.build(8 + 8 + bufferSize);
            // write static data known at compile time
            bb.write_u64(n);
            bb.write_u64(entrySizeInBytes);
            for (let i = 0; i < bufferSize; i += 1) {
                bb.write_u8(0xCC);
            }

            // get offset
            const offset = ac.b.heapStore(bb.asBytes());

            // write dynamic data
            const tmp = ac.tmp();
            let hp = offset + 8 + 8;
            for (let i = 0; i < args.length; i += 1) {
                emitExpr(ac, tmp, block, args[i]);
                ac.b.mov_m_r(hp, tmp.reg);
                hp += 8;
            }
            tmp.free();

            store.write_imm(BigInt(offset));
            break;
        }
        case NodeType.TypeInstance: {
            const x = e as A.TypeInstance;

            // compute struct info
            const ss: StructState = {
                map: {},
                xs: [],
                offset: 0,
                index: 0,
            };
            const v = P.buildVar("tmp", x.type, true, false, false, x.loc);
            computeStructInfo(ss, block, v, v.id);

            const bb = ByteBuffer.build(ss.offset);
            // write static data known at compile time
            for (let i = 0; i < ss.offset; i += 1) {
                bb.write_u8(0xCC);
            }

            // get offset
            const offset = ac.b.heapStore(bb.asBytes());

            // write dynamic data
            const tmp = ac.tmp();
            let hp = offset;
            for (let i = 0; i < x.args.length; i += 1) {
                emitExpr(ac, tmp, block, x.args[i]);
                ac.b.mov_m_r(hp, tmp.reg);
                hp += ss.xs[i].size;
            }
            tmp.free();

            store.write_imm(BigInt(offset));
            break;
        }
        case NodeType.DereferenceExpr: {
            const x = e as A.DereferenceExpr;

            const r = ac.tmp();
            emitExpr(ac, r, block, x.expr);
            derefer(store, r);
            r.free();
            break;
        }
        case NodeType.IDExpr: {
            const x = e as A.IDExpr;
            const ids = ac.get(x.id);

            if (ids.isRegister || !x.rest.length) {
                if (store.isWrite) {
                    store.write_reg(ids);
                }
                else {
                    ids.write_reg(store);
                }
            }
            else {
                const id = [x.id].concat(...x.rest).join(".");
                const mem = ids.memory();
                const sm = mem.ss.xs[mem.ss.map[id]];

                const tmp = ac.tmp();
                tmp.write_reg(mem);  // tmp = mem
                ac.b.add_r_i(tmp.reg, sm.offset);

                if (store.isWrite) {
                    store.write_deref(tmp); // store = tmp
                }
                else {
                    tmp.write_reg_to_deref(store); // tmp = store

                }
                tmp.free();
            }
            break;
        }
        case NodeType.ArrayExpr: {
            const x = e as A.ArrayExpr;

            const index = ac.tmp();
            emitExpr(ac, index, block, x.args[0]);

            // get element size offset
            const t1 = ac.tmp();
            t1.write_reg(ac.get(x.expr.id));
            ac.b.add_r_i(t1.reg, 8);

            const t2 = ac.tmp();
            ac.b.mov_r_ro(t2.reg, t1.reg);
            ac.b.mul_r_r(t2.reg, index.reg);

            ac.b.add_r_i(t2.reg, 8);
            ac.b.add_r_r(t2.reg, t1.reg);

            derefer(store, t2);

            index.free();
            t1.free();
            t2.free();
            break;
        }
        case NodeType.LocalReturnExpr: {
            const x = e as A.LocalReturnExpr;
            emitExpr(ac, store, block, x.expr);
            break;
        }
        case NodeType.IfExpr: {
            const x = e as A.IfExpr;

            const r = ac.tmp();
            emitExpr(ac, r, block, x.condition);
            ac.b.cmp_r_i(r.reg, 1);
            r.free();

            const gotoElse = `else-${ac.b.codeOffset()}`;
            ac.b.jnz(gotoElse);

            emitBlock(ac, store, x.ifBranch);
            const gotoEnd = `end-${ac.b.codeOffset()}`;
            ac.b.jmp(gotoEnd);

            const elseOffset = ac.b.codeOffset();
            emitBlock(ac, store, x.elseBranch);
            const endOffset = ac.b.codeOffset();

            ac.b.mapCodeOffset(gotoElse, elseOffset);
            ac.b.mapCodeOffset(gotoEnd, endOffset);
            break;
        }
        case NodeType.CastExpr: {
            const x = e as A.CastExpr;
            emitExpr(ac, store, block, x.expr);
            break;
        }
        case NodeType.VoidExpr: {
            break;
        }
        case NodeType.ReferenceExpr: {
            const x = e as A.ReferenceExpr;
            const old = store.isValue;
            store.isValue = false;
            emitExpr(ac, store, block, x.expr);
            store.isValue = old;
            break;
        }
        case NodeType.BlockExpr: {
            const x = e as A.BlockExpr;
            emitBlock(ac, store, x);
            break;
        }
        case NodeType.GroupExpr: {
            const x = e as A.GroupExpr;
            emitExpr(ac, store, block, x.expr);
            break;
        }
        default: Errors.raiseDebug(NodeType[e.nodeType]);
    }
}

function emitStmt(ac: Allocator, store: Store, block: A.BlockExpr, s: Stmt) {
    Logger.debug("##===========##");
    switch (s.nodeType) {
        case NodeType.VarInitStmt: {
            const x = s as A.VarInitStmt;
            const tmp = ac.tmp();
            emitExpr(ac, tmp, block, x.expr);
            if (x.var.type.native.bits === 0) {
                const ss = {
                    map: {},
                    xs: [],
                    offset: 0,
                    index: 0,
                }
                computeStructInfo(ss, block, x.var, x.var.id);
                const r = ac.alloc(x.var, ss);
                r.write_reg(tmp);
            }
            else {
                const r = ac.alloc(x.var);
                r.write_reg(tmp);
            }
            tmp.free();
            break;
        }
        case NodeType.VarAssnStmt: {
            const x = s as A.VarAssnStmt;
            const r = ac.tmp();
            r.isRHS = true;
            emitExpr(ac, r, block, x.rhs);
            r.isWrite = false;
            r.isRHS = false;
            emitExpr(ac, r, block, x.lhs);
            r.free();
            break;
        }
        case NodeType.ReturnStmt: {
            const x = s as A.ReturnStmt;
            emitExpr(ac, store, block, x.expr);
            ac.b.ret();
            break;
        }
        case NodeType.ExprStmt: {
            const x = s as A.ExprStmt;
            emitExpr(ac, store, block, x.expr);
            break;
        }
        case NodeType.ForStmt: {
            const x = s as A.ForStmt;

            if (x.init) emitStmt(ac, store, block, x.init);

            const startOffset = ac.b.codeOffset();
            const gotoStart = `start-${startOffset}`;
            let gotoEnd = ";"

            if (x.condition) {
                const r = ac.tmp();
                emitExpr(ac, r, block, x.condition);
                ac.b.cmp_r_i(r.reg, 1);
                gotoEnd = `end-${ac.b.codeOffset()}`;
                ac.b.jnz(gotoEnd);
                r.free();
            }

            emitBlock(ac, store, x.body);
            if (x.update) emitStmt(ac, store, block, x.update);
            ac.b.jmp(gotoStart);
            const endOffset = ac.b.codeOffset();

            ac.b.mapCodeOffset(gotoStart, startOffset);
            if (gotoEnd) ac.b.mapCodeOffset(gotoEnd, endOffset);

            break;
        }
        default: Errors.raiseDebug(NodeType[s.nodeType]);
    }
}

function emitBlock(ac: Allocator, store: Store, block: A.BlockExpr) {
    ac = ac.newAllocator();
    block.xs.forEach(x => emitStmt(ac, store, block, x));
}

function emitFunction(b: VmCodeBuilder, f: P.Function) {
    b.startFunction(f.mangledName);
    const ac = Allocator.build(b);
    const scratch = ac.tmp();
    if (scratch.reg !== "r0") Errors.raiseDebug();
    f.params.forEach(x => ac.alloc(x));
    emitBlock(ac, scratch, f.body);
    b.ret();
}

export default function vm_gen_code(mods: P.Module[]) {
    const reduce = <A>(ys: A[], xs: A[]) => { ys.push(...xs); return ys;  };
    const foreignFunctions = mods.map(x => x.foreignFunctions).reduce(reduce);
    const functions = mods.map(x => x.functions).reduce(reduce);

    const b = VmCodeBuilder.build();

    foreignFunctions.forEach(x => b.addForeignFunction(x.mangledName));

    // first, main
    const xs = functions.filter(x => x.id === "main");
    const main = xs.length ? xs[0] : undefined;
    if (!main) Errors.raiseVmError("main() not found");
    emitFunction(b, main!);

    // then, rest
    const ys = functions.filter(x => x.id !== "main");
    ys.forEach(x => emitFunction(b, x));

    return b;
}