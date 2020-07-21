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
import {enableThrowError, InvalidNumber, InvalidToken, UnbalancedComment, UnterminatedString} from "../errors.ts";

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
    enableThrowError(true);
    assertThrows((): void => {
        lex(buildCharacterStream("0x"));
    }, InvalidNumber);
    enableThrowError(false);
});

Deno.test("Incomplete Octal Number", () => {
    enableThrowError(true);
    assertThrows((): void => {
        lex(buildCharacterStream("0o"));
    }, InvalidNumber);
    enableThrowError(false);
});

Deno.test("Incomplete Binary Number", () => {
    enableThrowError(true);
    assertThrows((): void => {
        lex(buildCharacterStream("0b"));
    }, InvalidNumber);
    enableThrowError(false);
});

Deno.test("Invalid Number", () => {
    enableThrowError(true);
    assertThrows((): void => {
        lex(buildCharacterStream("0B"));
    }, InvalidNumber);
    enableThrowError(false);
});

Deno.test("Invalid Hexadecimal Number", () => {
    enableThrowError(true);
    assertThrows((): void => {
        lex(buildCharacterStream("0xFG"));
    }, InvalidNumber);
    enableThrowError(false);
});

Deno.test("Invalid Decimal Number", () => {
    enableThrowError(true);
    assertThrows(() => {
        lex(buildCharacterStream("012"));
    }, InvalidNumber);
    enableThrowError(false);
});

Deno.test("Invalid Octal Number", () => {
    enableThrowError(true);
    assertThrows((): void => {
        lex(buildCharacterStream("0o78"));
    }, InvalidNumber);
    enableThrowError(false);
});

Deno.test("Invalid Binary Number", () => {
    enableThrowError(true);
    assertThrows((): void => {
        lex(buildCharacterStream("0b12"));
    }, InvalidNumber);
    enableThrowError(false);
});

Deno.test("Unbalanced comment", () => {
    enableThrowError(true);
    assertThrows((): void => {
        lex(buildCharacterStream("/*"));
    }, UnbalancedComment);
    enableThrowError(false);
});

Deno.test("Unterminated string", () => {
    enableThrowError(true);
    assertThrows((): void => {
        lex(buildCharacterStream('"abc'));
    }, UnterminatedString);
    enableThrowError(false);
});