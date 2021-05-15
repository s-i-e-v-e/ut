/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import {Dictionary} from "../util/mod.ts";
import {A} from "./mod.ts";
import {parse, parseNative} from "./mod.internal.ts";
import {Errors, Logger, OS} from "../util/mod.ts";

async function parseModule(modules: Dictionary<A.Module>, id: string, base: string, path: string) {
    const fp =`${base}/${path[0] === '.' ? path.substring(2) : path}`;
    Logger.info(`base: ${base}, id: ${id}, path: ${path}, fullPath: ${fp}`);
    const f = await OS.readSourceFile(fp);
    Logger.info(`Running: ${fp} [${f.fsPath}]`);
    const m = parse(id, f);
    modules[m.id] = m;
    for (const im of m.imports) {
        if (!modules[im.id]) {
            const mid = im.id.replaceAll(/\./g, "/");
            const ad = `${base}/${mid}`;
            const a1 = `${base}/${mid}/mod.ut`;
            const a2 = `${base}/${mid}.ut`;
            await parseModule(modules, im.id, '.', OS.isDir(ad) ? a1 : a2);
        }
    }
}

function getFileName(path: string) {
    const a = path.lastIndexOf("/")+1;
    const b = path.lastIndexOf(".");
    Errors.ASSERT(a < b);
    return path.substring(a, b);
}

async function parseFile(base: string, path: string) {
    const modules: Dictionary<A.Module> = {};
    const nms = parseNative();

    path = path.replaceAll(/\\/g, "/");
    const id = getFileName(path);
    base = base || path.substring(0, path.indexOf("/")+1);
    await parseModule(modules, id, base, path);

    const mods = [];
    mods.push(...nms);
    mods.push(modules[id]);

    mods.push(...Object.keys(modules).map(x => modules[x]).filter(x => x.id !== id));
    return mods;
}

export {
    parseFile,
}