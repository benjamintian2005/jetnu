// Loads camxes.pegjs through pegjs 0.8's own grammar-text parser, giving us
// the exact same rule AST the compiled camxes.js was built from (777 rules).
// We walk this AST directly instead of re-parsing the human-readable
// camxes.peg file ourselves.

const fs = require('fs');
const path = require('path');
const PEG = require(path.join(__dirname, '../../vendor/ilmentufa/node_modules/pegjs'));

const GRAMMAR_PATH = path.join(__dirname, '../../vendor/ilmentufa/camxes.pegjs');

const ast = PEG.parser.parse(fs.readFileSync(GRAMMAR_PATH, 'utf8'));
const rulesByName = new Map(ast.rules.map(r => [r.name, r.expression]));

module.exports = { ast, rulesByName };
