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
import {enableThrowError, InvalidNumber, InvalidToken} from "../error.ts";

Deno.test("Hexadecimal Number", () => {
    const xs = lex(CharacterStream.build("0x1234"));
    assertEquals(xs.data.length, 1);
    const x = xs.data[0];
    assertEquals(x.lexeme, "0x1234");
    assertEquals(x.type, TokenType.TK_HEXADECIMAL_NUMBER_LITERAL);
});


Deno.test("Decimal Number", () => {
    const xs = lex(CharacterStream.build("1234"));
    assertEquals(xs.data.length, 1);
    const x = xs.data[0];
    assertEquals(x.lexeme, "1234");
    assertEquals(x.type, TokenType.TK_DECIMAL_NUMBER_LITERAL);
});

Deno.test("Octal Number", () => {
    const xs = lex(CharacterStream.build("0o1234"));
    assertEquals(xs.data.length, 1);
    const x = xs.data[0];
    assertEquals(x.lexeme, "0o1234");
    assertEquals(x.type, TokenType.TK_OCTAL_NUMBER_LITERAL);
});

Deno.test("Binary Number", () => {
    const xs = lex(CharacterStream.build("0b10110"));
    assertEquals(xs.data.length, 1);
    const x = xs.data[0];
    assertEquals(x.lexeme, "0b10110");
    assertEquals(x.type, TokenType.TK_BINARY_NUMBER_LITERAL);
});

Deno.test("Incomplete Hexadecimal Number", () => {
    enableThrowError(true);
    assertThrows((): void => {
        lex(CharacterStream.build("0x"));
    }, InvalidNumber);
    enableThrowError(false);
});

Deno.test("Incomplete Octal Number", () => {
    enableThrowError(true);
    assertThrows((): void => {
        lex(CharacterStream.build("0o"));
    }, InvalidNumber);
    enableThrowError(false);
});

Deno.test("Incomplete Binary Number", () => {
    enableThrowError(true);
    assertThrows((): void => {
        lex(CharacterStream.build("0b"));
    }, InvalidNumber);
    enableThrowError(false);
});

Deno.test("Invalid Number", () => {
    enableThrowError(true);
    assertThrows((): void => {
        lex(CharacterStream.build("0B"));
    }, InvalidNumber);
    enableThrowError(false);
});

Deno.test("Invalid Hexadecimal Number", () => {
    enableThrowError(true);
    assertThrows((): void => {
        lex(CharacterStream.build("0xFG"));
    }, InvalidNumber);
    enableThrowError(false);
});

Deno.test("Invalid Decimal Number", () => {
    enableThrowError(true);
    assertThrows(() => {
        lex(CharacterStream.build("012"));
    }, InvalidNumber);
    enableThrowError(false);
});

Deno.test("Invalid Octal Number", () => {
    enableThrowError(true);
    assertThrows((): void => {
        lex(CharacterStream.build("0o78"));
    }, InvalidNumber);
    enableThrowError(false);
});

Deno.test("Invalid Binary Number", () => {
    enableThrowError(true);
    assertThrows((): void => {
        lex(CharacterStream.build("0b12"));
    }, InvalidNumber);
    enableThrowError(false);
});