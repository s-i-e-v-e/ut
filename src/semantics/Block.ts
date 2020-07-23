/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import {
    FunctionPrototype,
    Variable
} from "../parser/mod.ts";
import {
    NameTable
} from "./mod.internal.ts";
import {
    Operation, OperationType,
    ValOp,
} from "./mod.ts";

export default class Block {
    private readonly nt: NameTable;
    private readonly blocks: Array<Block>;
    private readonly ops: Array<any>;

    private constructor(private readonly id: string) {
        this.nt = NameTable.build();
        this.blocks = [];
        this.ops = [];
    }

    defineVar(v: Variable) {
        this.nt.add(v.id);
    }

    defineFunction(fp: FunctionPrototype) {
        this.nt.add(fp.id);
    }

    defineTempVar() {
        return this.nt.add("t");
    }

    getVar(id: string) {
        return this.nt.get(id);
    }

    useVar(dest: string, src: ValOp) {
        this.ops.push({
            dest: dest,
            src: src,
            opType: OperationType.UseVar,
        });
    }

    call(id: string, args: string[]) {
        this.ops.push({
            id: id,
            args: args,
            opType: OperationType.Call,
        });
    }

    newBlock(id: string) {
        const x = Block.build(id);
        this.blocks.push(x);
        return x;
    }

    toConsole() {
        console.group();
        console.log(`BLOCK: ${this.id}`);
        console.log("[vars]");
        this.nt.toConsole();
        console.log("[ops]");
        for (const op of this.ops) {
            console.log(op);
        }
        console.log("[blocks]");
        for (const b of this.blocks) {
            b.toConsole();
        }
        console.log("=====");
        console.groupEnd();
    }

    static build(id: string) {
        return new Block(id);
    }
}