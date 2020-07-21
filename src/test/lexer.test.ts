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
import lex from "../lexer.ts";
import {CharacterStream, TokenType} from "../common.ts";
import Ut from "../util/mod.ts";
const Errors = Ut.errors;

function buildCharacterStream(x: string) {
    return CharacterStream.build(x+"\n");
}

Deno.test("Hexadecimal Number", () => {
    const xs = lex(buildCharacterStream("0x1234"));
    assertEquals(xs.data.length, 2);
    const x = xs.data[0];
    assertEquals(x.lexeme, "0x1234");
    assertEquals(x.type, TokenType.TK_HEXADECIMAL_NUMBER_LITERAL);
});


Deno.test("Decimal Number", () => {
    const xs = lex(buildCharacterStream("1234"));
    assertEquals(xs.data.length, 2);
    const x = xs.data[0];
    assertEquals(x.lexeme, "1234");
    assertEquals(x.type, TokenType.TK_DECIMAL_NUMBER_LITERAL);
});

Deno.test("Octal Number", () => {
    const xs = lex(buildCharacterStream("0o1234"));
    assertEquals(xs.data.length, 2);
    const x = xs.data[0];
    assertEquals(x.lexeme, "0o1234");
    assertEquals(x.type, TokenType.TK_OCTAL_NUMBER_LITERAL);
});

Deno.test("Binary Number", () => {
    const xs = lex(buildCharacterStream("0b10110"));
    assertEquals(xs.data.length, 2);
    const x = xs.data[0];
    assertEquals(x.lexeme, "0b10110");
    assertEquals(x.type, TokenType.TK_BINARY_NUMBER_LITERAL);
});

Deno.test("Incomplete Hexadecimal Number", () => {
    assertThrows((): void => {
        lex(buildCharacterStream("0x"));
    }, Errors.InvalidNumber);
});

Deno.test("Incomplete Octal Number", () => {
    assertThrows((): void => {
        lex(buildCharacterStream("0o"));
    }, Errors.InvalidNumber);
});

Deno.test("Incomplete Binary Number", () => {
    assertThrows((): void => {
        lex(buildCharacterStream("0b"));
    }, Errors.InvalidNumber);
});

Deno.test("Invalid Number", () => {
    assertThrows((): void => {
        lex(buildCharacterStream("0B"));
    }, Errors.InvalidNumber);
});

Deno.test("Invalid Hexadecimal Number", () => {
    assertThrows((): void => {
        lex(buildCharacterStream("0xFG"));
    }, Errors.InvalidNumber);
});

Deno.test("Invalid Decimal Number", () => {
    assertThrows(() => {
        lex(buildCharacterStream("012"));
    }, Errors.InvalidNumber);
});

Deno.test("Invalid Octal Number", () => {
    assertThrows((): void => {
        lex(buildCharacterStream("0o78"));
    }, Errors.InvalidNumber);
});

Deno.test("Invalid Binary Number", () => {
    assertThrows((): void => {
        lex(buildCharacterStream("0b12"));
    }, Errors.InvalidNumber);
});

Deno.test("Unbalanced comment", () => {
    assertThrows((): void => {
        lex(buildCharacterStream("/*"));
    }, Errors.UnbalancedComment);
});

Deno.test("Unterminated string", () => {
    assertThrows((): void => {
        lex(buildCharacterStream('"abc'));
    }, Errors.UnterminatedString);
});