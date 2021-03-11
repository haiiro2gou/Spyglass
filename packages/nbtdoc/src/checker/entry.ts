import type * as core from '@spyglassmc/core'
import type { Checker, RangeLike, Symbol } from '@spyglassmc/core'
import { ErrorSeverity, Range, SymbolUtil, SymbolVisibility } from '@spyglassmc/core'
import { localeQuote, localize } from '@spyglassmc/locales'
import type { Segments } from '../binder'
import { identifierToSeg, segToIdentifier } from '../binder'
import type { CompoundDefinitionNode, DescribesClauseNode, EnumDefinitionNode, IdentPathToken, InjectClauseNode, MainNode, ModuleDeclarationNode, UseClauseNode } from '../node'
import type { CheckerContext } from './CheckerContext'

export const entry: Checker<MainNode> = async (node: MainNode, ctx: core.CheckerContext): Promise<void> => {
	const modSeg = uriToSeg(ctx.doc.uri, ctx)
	if (modSeg === null) {
		ctx.err.report(localize('nbtdoc.checker.entry.null-mod-seg'), 0, ErrorSeverity.Warning)
		return
	} else if (modSeg.length === 0) {
		ctx.err.report(localize('nbtdoc.checker.entry.empty-mod-seg'), 0, ErrorSeverity.Warning)
	}
	const modIdentifier = segToIdentifier(modSeg)
	const modSymbol = ctx.symbols.lookup('nbtdoc', [modIdentifier], ctx.doc.uri)!.symbol

	const compoundDefinitions: CompoundDefinitionNode[] = []
	const describesClauses: DescribesClauseNode[] = []
	const enumDefinitions: EnumDefinitionNode[] = []
	const injectClauses: InjectClauseNode[] = []
	const moduleDeclarations: ModuleDeclarationNode[] = []
	const useClauses: UseClauseNode[] = []

	for (const childNode of node.children) {
		switch (childNode.type) {
			case 'comment':
				break
			case 'nbtdoc:compound_definition':
				compoundDefinitions.push(childNode)
				break
			case 'nbtdoc:describes_clause':
				describesClauses.push(childNode)
				break
			case 'nbtdoc:enum_definition':
				enumDefinitions.push(childNode)
				break
			case 'nbtdoc:inject_clause':
				injectClauses.push(childNode)
				break
			case 'nbtdoc:module_declaration':
				moduleDeclarations.push(childNode)
				break
			case 'nbtdoc:use_clause':
				useClauses.push(childNode)
				break
		}
	}

	const nbtdocCtx: CheckerContext = {
		...ctx,
		modIdentifier,
		modSeg,
		modSymbol,
	}

	// Hoisting declarations.
	await Promise.all([
		...compoundDefinitions.map(n => compoundDefinitionHoisting(n, nbtdocCtx)),
		...enumDefinitions.map(n => enumDefinitionHoisting(n, nbtdocCtx)),
		...moduleDeclarations.map(n => moduleDeclaration(n, nbtdocCtx)),
		...useClauses.map(n => useClause(n, nbtdocCtx)),
	])

	// Actual checking.
	await Promise.all([
		...compoundDefinitions.map(n => compoundDefinition(n, nbtdocCtx)),
		...describesClauses.map(n => describesClause(n, nbtdocCtx)),
		...enumDefinitions.map(n => enumDefinition(n, nbtdocCtx)),
		...injectClauses.map(n => injectClause(n, nbtdocCtx)),
	])
}

const compoundDefinition = async (node: CompoundDefinitionNode, ctx: CheckerContext): Promise<void> => {

}

const compoundDefinitionHoisting = async (node: CompoundDefinitionNode, ctx: CheckerContext): Promise<void> => {
	if (!node.identifier.value) {
		return
	}
	ctx.symbols
		.query(ctx.doc, 'nbtdoc', ctx.modIdentifier, node.identifier.value)
		.ifDeclared(symbol => reportDuplicatedDeclaration('nbtdoc.checker.duplicated-identifier', ctx, symbol, node.identifier))
		.elseEnter({
			usage: 'definition',
			range: node.identifier,
			subcategory: 'compound',
			doc: node.doc.doc,
		})
	// .elseAlias({
	// 	category: 'nbtdoc',
	// 	identifier: node.identifier.value,
	// 	visibility: SymbolVisibility.File,
	// })
}

const describesClause = async (node: DescribesClauseNode, ctx: CheckerContext): Promise<void> => {

}

const enumDefinition = async (node: EnumDefinitionNode, ctx: CheckerContext): Promise<void> => {

}

const enumDefinitionHoisting = async (node: EnumDefinitionNode, ctx: CheckerContext): Promise<void> => {
	if (!node.identifier.value) {
		return
	}
	ctx.symbols
		.query(ctx.doc, 'nbtdoc', ctx.modIdentifier, node.identifier.value)
		.ifDeclared(symbol => reportDuplicatedDeclaration('nbtdoc.checker.duplicated-identifier', ctx, symbol, node.identifier))
		.elseEnter({
			usage: 'definition',
			range: node.identifier,
			subcategory: 'enum',
			doc: node.doc.doc,
		})
	// .elseAlias({
	// 	category: 'nbtdoc',
	// 	identifier: node.identifier.value,
	// 	visibility: SymbolVisibility.File,
	// })
}

const injectClause = async (node: InjectClauseNode, ctx: CheckerContext): Promise<void> => {

}

const moduleDeclaration = async (node: ModuleDeclarationNode, ctx: CheckerContext): Promise<void> => {
	if (node.identifier.value.length) {
		const declaredSeg = [...ctx.modSeg, node.identifier.value]
		const declaredIdentifier = segToIdentifier(declaredSeg)
		ctx.symbols
			.query(ctx.doc, 'nbtdoc', declaredIdentifier)
			.ifUnknown(() => ctx.err.report(
				localize('nbtdoc.checker.module-declaration.non-existent', [localeQuote(declaredIdentifier)]),
				node.identifier
			))
			.ifDeclared(symbol => reportDuplicatedDeclaration('nbtdoc.checker.module-declaration.duplicated', ctx, symbol, node.identifier))
			.elseEnter({
				usage: 'declaration',
				range: node.identifier,
				fullRange: node,
			})
	}
}

const useClause = async (node: UseClauseNode, ctx: CheckerContext): Promise<void> => {
	const usedSymbol = await resolveIdentPath(node.path, ctx)
	if (usedSymbol) {
		const lastToken = node.path.children[node.path.children.length - 1]
		ctx.symbols
			.query(ctx.doc, 'nbtdoc', ctx.modIdentifier, usedSymbol.identifier)
			.ifDeclared(symbol => reportDuplicatedDeclaration('nbtdoc.checker.duplicated-identifier', ctx, symbol, lastToken))
			.elseEnter({
				usage: 'declaration',
				range: lastToken,
				relations: {
					aliasOf: usedSymbol,
				},
				...node.isExport ? {} : { visibility: SymbolVisibility.File },
			})
	}
}

function reportDuplicatedDeclaration(localeString: string, ctx: CheckerContext, symbol: Symbol, range: RangeLike) {
	ctx.err.report(
		localize(localeString, [localeQuote(symbol.identifier)]),
		range, ErrorSeverity.Warning,
		{
			related: [{
				location: SymbolUtil.getDeclaredLocation(symbol),
				message: localize(`${localeString}.related`, [localeQuote(symbol.identifier)]),
			}],
		}
	)
}

function uriToSeg(uri: string, ctx: core.CheckerContext): Segments | null {
	const identifier = Object
		.keys(ctx.symbols.global.nbtdoc ?? {})
		.find(identifier => {
			const symbol = ctx.symbols.global.nbtdoc![identifier]!
			return symbol.subcategory === 'module' && symbol.implementation?.some(loc => loc.uri === uri)
		})
	return identifier ? identifierToSeg(identifier) : null
}

function segToUri(seg: Segments, ctx: core.CheckerContext): string | null {
	const identifier = segToIdentifier(seg)
	return ctx.symbols.global.nbtdoc?.[identifier]?.implementation?.[0]?.uri ?? null
}

/**
 * @returns The actual symbol being used/imported from another module.
 */
async function resolveIdentPath(identPath: IdentPathToken, ctx: CheckerContext): Promise<Symbol | null> {
	const targetSeg = identPath.fromGlobalRoot ? [] : [...ctx.modSeg]
	for (const [i, token] of identPath.children.entries()) {
		if (i < identPath.children.length - 1) {
			// Referencing to a module.

			// Resolve this token.
			if (token.value === 'super') {
				if (targetSeg.length === 0) {
					ctx.err.report(localize('nbtdoc.checker.ident-path.super-from-root'), Range.span(token, identPath))
					return null
				}
				targetSeg.pop()
			} else {
				targetSeg.push(token.value)
			}

			ctx.symbols
				.query(ctx.doc, 'nbtdoc', segToIdentifier(targetSeg))
				.ifUnknown(() => { }) // Simply ignore. Unknown modules will be reported at the last token of the ident path.
				.elseEnter({
					usage: 'reference',
					range: token,
					// TODO: If this token is 'super', we should make sure that renaming the module will not change this 'super' to the new name of the module.
				})
		} else {
			// Referencing to a compound or enum.

			const currentId = segToIdentifier(ctx.modSeg)
			const targetId = segToIdentifier(targetSeg)
			if (currentId !== targetId) {
				// The referenced compound/enum is in another module.
				// We should load and check that module first.

				const targetUri = segToUri(targetSeg, ctx)
				const targetDocAndNode = targetUri ? await ctx.service.ensure(targetUri) : null
				if (targetDocAndNode) {
					await ctx.service.check(targetDocAndNode.node, targetDocAndNode.doc)
				} else {
					ctx.err.report(
						localize('nbtdoc.checker.ident-path.unknown-module', [localeQuote(targetId)]),
						Range.span(token, identPath)
					)
					return null
				}
			}

			return ctx.symbols
				.query(ctx.doc, 'nbtdoc', targetId, token.value)
				.ifUnknown(() => ctx.err.report(
					localize('nbtdoc.checker.ident-path.unknown-identifier', [localeQuote(token.value), localeQuote(targetId)]),
					Range.span(token, identPath)
				))
				.elseEnter({
					usage: 'reference',
					range: token,
				})
				.heyGimmeDaSymbol()
		}
	}
	return null
}