/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import parse from "./parser.ts";
import * as logger from "./logger.ts";

export default async function run(path: string) {
    const f = {
        path: path,
        fsPath: await Deno.realPath(path),
        contents: await Deno.readTextFile(path),
    };
    logger.info(`Running: ${path} [${f.fsPath}]`);
    parse(f);
}