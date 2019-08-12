import * as assert from 'power-assert'
import { ArgumentParserResult } from '../../types/Parser'
import { CommandTreeNode, CommandTree, CommandTreeNodeChildren } from '../../CommandTree'
import { describe, it } from 'mocha'
import ArgumentParser from '../../parsers/ArgumentParser'
import ParsingError from '../../types/ParsingError'
import StringReader from '../../utils/StringReader'
import LineParser from '../../parsers/LineParser'
import { fail } from 'assert'

/**
 * Argument parser for testing.
 */
class TestArgumentParser implements ArgumentParser<string> {
    readonly identity = 'test'

    /**
     * Input `error` to attain a tolerable `ParsingError`.
     * 
     * Input `ERROR` to attain an untolerable `ParsingError`.
     * 
     * Input `cache` to attain a `LocalCache` containing `id`.
     * 
     * Input `CACHE` to attain a `LocalCache` containing both `id` and `description`.
     * 
     * Input `completion` to attain a completion.
     */
    constructor(private readonly type: 'error' | 'ERROR' | 'cache' | 'CACHE' | 'completion' | 'normal' = 'normal') { }

    parse(reader: StringReader): ArgumentParserResult<string> {
        const start = reader.cursor
        const data = reader.readUntilOrEnd(' ')
        const ans: ArgumentParserResult<string> = { data }
        if (this.type === 'error') {
            ans.errors = [new ParsingError({ start: start, end: start + 5 }, 'expected `error` and did get `error`')]
        } else if (this.type === 'ERROR') {
            ans.errors = [new ParsingError({ start: start, end: start + 5 }, 'expected `ERROR` and did get `ERROR`', false)]
        } else if (this.type === 'cache') {
            ans.cache = { ref: {}, def: { fakePlayers: { foo: undefined } } }
        } else if (this.type === 'CACHE') {
            ans.cache = { ref: {}, def: { fakePlayers: { foo: '*foo*' } } }
        } else if (this.type === 'completion') {
            ans.completions = [{ label: 'completion' }]
        }
        return ans
    }
    getExamples = () => []
}

describe('LineParser Tests', () => {
    describe('parseSinge() Tests', () => {
        it('Should throw error when specify neither redirect nor parser in node', () => {
            const input = 'foo'
            const parser = new LineParser({})
            const node: CommandTreeNode<string> = {}
            try {
                parser.parseSingle(new StringReader(input), 'node', node)
                fail()
            } catch (e) {
                const { message } = e
                assert(message === 'Got neither `redirect` nor `parser` in node.')
            }
        })
        it('Should parse when parser specified', () => {
            const input = 'foo'
            const parser = new LineParser({})
            const node: CommandTreeNode<string> = { parser: new TestArgumentParser() }
            const { args } = parser.parseSingle(new StringReader(input), 'node', node)
            assert.deepStrictEqual(args, [{ data: 'foo', name: 'node' }])
        })
        it('Should handle redirect to children', () => {
            const input = 'foo'
            const tree: CommandTree = {
                redirect: {
                    test: {
                        parser: new TestArgumentParser()
                    }
                }
            }
            const parser = new LineParser(tree)
            const node: CommandTreeNode<string> = { redirect: 'redirect', description: 'description' }
            const { args } = parser.parseSingle(new StringReader(input), 'node', node, { args: [{ data: 'parsed', name: 'parsed' }] })
            assert.deepStrictEqual(args, [{ data: 'parsed', name: 'parsed' }, { data: 'foo', name: 'test' }])
        })
        it('Should handle redirect to single', () => {
            const input = 'foo'
            const tree: CommandTree = {
                redirect: {
                    test: {
                        parser: new TestArgumentParser()
                    }
                }
            }
            const parser = new LineParser(tree)
            const node: CommandTreeNode<string> = { redirect: 'redirect.test', description: 'description' }
            const { args } = parser.parseSingle(new StringReader(input), 'node', node, { args: [{ data: 'parsed', name: 'parsed' }] })
            assert.deepStrictEqual(args, [{ data: 'parsed', name: 'parsed' }, { data: 'foo', name: 'test' }])
        })
    })
    describe('parseChildren() Tests', () => {
        it('Should throw error when the children is empty', () => {
            const tree: CommandTree = {}
            const reader = new StringReader('foo')
            const parser = new LineParser(tree)
            const children: CommandTreeNodeChildren = {}
            try {
                parser.parseChildren(reader, children)
                fail()
            } catch (e) {
                const { message } = e
                assert(message === 'Unexpected error. Maybe there is an empty children in CommandTree?')
            }
        })
        it('Should return the first child if no error occurrs', () => {
            const tree: CommandTree = {
                children: {
                    first: {
                        parser: new TestArgumentParser()
                    },
                    last: {
                        parser: new TestArgumentParser()
                    }
                }
            }
            const reader = new StringReader('foo')
            const parser = new LineParser(tree)
            const actual = parser.parseChildren(reader, tree.children)
            assert.deepStrictEqual(actual, { args: [{ data: 'foo', name: 'first' }] })
        })
        it('Should return the first child if only tolerable error occurrs', () => {
            const tree: CommandTree = {
                children: {
                    first: {
                        parser: new TestArgumentParser('error')
                    },
                    last: {
                        parser: new TestArgumentParser()
                    }
                }
            }
            const reader = new StringReader('foo')
            const parser = new LineParser(tree)
            const actual = parser.parseChildren(reader, tree.children)
            assert.deepStrictEqual(actual, {
                args: [{ data: 'foo', name: 'first' }],
                errors: [new ParsingError({ start: 0, end: 5 }, 'expected `error` and did get `error`')]
            })
        })
        it('Should return the last child if untolerable error occurrs', () => {
            const tree: CommandTree = {
                children: {
                    first: {
                        parser: new TestArgumentParser('ERROR')
                    },
                    last: {
                        parser: new TestArgumentParser()
                    }
                }
            }
            const reader = new StringReader('foo')
            const parser = new LineParser(tree)
            const actual = parser.parseChildren(reader, tree.children)
            assert.deepStrictEqual(actual, { args: [{ data: 'foo', name: 'last' }] })
        })
        it('Should return downgrade untolerable errors at last', () => {
            const tree: CommandTree = {
                children: {
                    first: {
                        parser: new TestArgumentParser('ERROR')
                    },
                    last: {
                        parser: new TestArgumentParser('ERROR')
                    }
                }
            }
            const reader = new StringReader('foo')
            const parser = new LineParser(tree)
            const actual = parser.parseChildren(reader, tree.children)
            assert.deepStrictEqual(actual, {
                args: [{ data: 'foo', name: 'last' }],
                errors: [new ParsingError({ start: 0, end: 5 }, 'expected `ERROR` and did get `ERROR`')]
            })
        })
        it('Should combine with parsed line', () => {
            const tree: CommandTree = {
                children: {
                    first: {
                        parser: new TestArgumentParser()
                    },
                    last: {
                        parser: new TestArgumentParser()
                    }
                }
            }
            const reader = new StringReader('foo')
            const parser = new LineParser(tree)
            const actual = parser.parseChildren(reader, tree.children, { args: [{ data: 'parsed', name: 'parsed' }] })
            assert.deepStrictEqual(actual, { args: [{ data: 'parsed', name: 'parsed' }, { data: 'foo', name: 'first' }] })
        })
    })
})
