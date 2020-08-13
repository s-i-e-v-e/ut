/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import {
    assertEquals,
    assertThrows,
} from "https://deno.land/std/testing/asserts.ts";
import {
    CharacterStream,
    lex,
    parseModule,
} from "../parser/mod.internal.ts";
import { Errors } from "../util/mod.ts";
import {A} from "../parser/mod.ts";

function parse(x: string) {
    const s = `fn main(){ return ${x}; }\n`;
    const cs = CharacterStream.build(s, "<mem>");
    const ts = lex(cs);
    return (parseModule("<id>",ts, "<mem>").functions[0].body!.xs[0] as A.ReturnStmt).expr;
}

function parseBinary(x: string) {
    const e = parse(x) as A.BinaryExpr;

    const lhs = re(e.left);
    const rhs = re(e.right);
    return {
        lhs: lhs,
        op: e.op,
        rhs: rhs,
    };
}

function re(e: any): string {
    switch (e.nodeType) {
        case A.NodeType.BooleanLiteral:
        case A.NodeType.NumberLiteral: {
            const x = e as A.NumberLiteral;
            return `${x.value}`;
        }
        case A.NodeType.BinaryExpr: {
            const x = e as A.BinaryExpr;
            const ll = re(x.left);
            const rr = re(x.right);
            return `${ll}${x.op}${rr}`;
        }
        default: Errors.raiseDebug(A.NodeType[e.nodeType]);
    }
}

Deno.test("BinaryExpr: 1 + 2", () => {
    const e = parseBinary("1 + 2");

    assertEquals(e.lhs, "1");
    assertEquals(e.rhs, "2");
    assertEquals(e.op, "+");
});

Deno.test("BinaryExpr: 7 * 2 + 3 * 4", () => {
    const e = parseBinary("7 * 2 + 3 * 4");

    assertEquals(e.lhs, "7*2");
    assertEquals(e.rhs, "3*4");
    assertEquals(e.op, "+");
});

Deno.test("BinaryExpr: 1 + 2 + 3 + 4", () => {
    const e = parseBinary("1 + 2 + 3 + 4");

    assertEquals(e.lhs, "1+2+3");
    assertEquals(e.rhs, "4");
    assertEquals(e.op, "+");
});

Deno.test("BinaryExpr: 1 * 2 * 3 * 4", () => {
    const e = parseBinary("1 * 2 * 3 * 4");

    assertEquals(e.lhs, "1*2*3");
    assertEquals(e.rhs, "4");
    assertEquals(e.op, "*");
});

Deno.test("BinaryExpr: 7 * 2 * 3 - 5", () => {
    const e = parseBinary("7 * 2 * 3 - 5");

    assertEquals(e.lhs, "7*2*3");
    assertEquals(e.rhs, "5");
    assertEquals(e.op, "-");
});

Deno.test("BinaryExpr: 1 == 1 & true", () => {
    const e = parseBinary("1 == 1 & true");

    assertEquals(e.lhs, "1==1");
    assertEquals(e.rhs, "true");
    assertEquals(e.op, "&");
});

Deno.test("BinaryExpr: 1 == 1 & 3 != 4 | false", () => {
    const e = parseBinary("1 == 1 & 3 != 4 | false");

    assertEquals(e.lhs, "1==1&3!=4");
    assertEquals(e.rhs, "false");
    assertEquals(e.op, "|");
});