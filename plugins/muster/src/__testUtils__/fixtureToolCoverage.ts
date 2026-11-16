// Reads a plugin's source with the TypeScript compiler to find its tool calls.
// eslint-disable-next-line no-restricted-imports
import fs from 'fs';
// eslint-disable-next-line no-restricted-imports
import path from 'path';
import ts from 'typescript';

/**
 * The drift guard of fixture mode (docs/fixtures.md): finds every call to
 * `MusterApi.callTool` and `callToolWithProgress` in a plugin's source and
 * works out, statically, which tool names each can call, so a test can check
 * that fixture mode has a handler for each.
 *
 * A tool-name argument resolves when it is a string literal, a constant, a
 * property of a constant object, a template literal or a concatenation of
 * resolvable parts, a conditional between resolvable branches, or the return
 * value of a function called with resolvable arguments. A parameter resolves
 * through every call of its function in the plugin (a JSX element passes a
 * component's props), so a wrapper such as `callManagerTool` or a client's
 * private `call` resolves to what its callers pass. Anything else falls back
 * to its type when that is a string literal or a union of them, and is
 * unresolved otherwise.
 */

/** Where a tool name could not be worked out: `<file>: <expression>`. */
export type UnresolvedToolName = string;

export type PluginToolCalls = {
  /** Every tool name a call can reach, sorted. */
  tools: string[];
  /** The expressions no tool name could be worked out for, sorted. */
  unresolved: UnresolvedToolName[];
};

/** The methods of `MusterApi` that call a tool, by their name. */
const TOOL_METHODS = new Set(['callTool', 'callToolWithProgress']);

/** The muster plugin's API declarations, which the methods must belong to. */
const MUSTER_APIS = path.resolve(__dirname, '../apis');

const REPO_ROOT = path.resolve(__dirname, '../../../..');

type FunctionNode = ts.SignatureDeclaration;
type Caller = ts.CallExpression | ts.JsxOpeningLikeElement;
type Context = ReadonlyMap<FunctionNode, Caller>;

class NeedCaller {
  constructor(
    readonly fn: FunctionNode,
    readonly node: ts.Node,
  ) {}
}

class Unresolvable {
  constructor(readonly node: ts.Node) {}
}

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Fixture code and test utilities are not what the pages call.
      return ['__fixtures__', '__testUtils__', 'fixtures'].includes(entry.name)
        ? []
        : sourceFiles(file);
    }
    return /\.tsx?$/.test(entry.name) &&
      !/\.(test|stories)\.tsx?$/.test(entry.name) &&
      !entry.name.endsWith('.d.ts') &&
      entry.name !== 'setupTests.ts'
      ? [file]
      : [];
  });
}

function compilerOptions(): ts.CompilerOptions {
  const parsed = ts.getParsedCommandLineOfConfigFile(
    path.join(REPO_ROOT, 'tsconfig.json'),
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: diagnostic => {
        throw new Error(
          ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
        );
      },
    },
  );
  if (!parsed) {
    throw new Error('tsconfig.json could not be read');
  }
  return { ...parsed.options, noEmit: true, incremental: false };
}

/** The name a call's callee is reached by, or undefined. */
function calleeName(expression: ts.LeftHandSideExpression): string | undefined {
  if (ts.isIdentifier(expression)) {
    return expression.text;
  }
  if (ts.isPropertyAccessExpression(expression)) {
    return expression.name.text;
  }
  if (
    ts.isElementAccessExpression(expression) &&
    ts.isStringLiteralLike(expression.argumentExpression)
  ) {
    return expression.argumentExpression.text;
  }
  return undefined;
}

/** The name a function is called by, for finding its calls quickly. */
function functionName(fn: FunctionNode): string | undefined {
  if (fn.name && ts.isIdentifier(fn.name)) {
    return fn.name.text;
  }
  const parent = fn.parent;
  if (
    (ts.isVariableDeclaration(parent) || ts.isPropertyAssignment(parent)) &&
    ts.isIdentifier(parent.name)
  ) {
    return parent.name.text;
  }
  return undefined;
}

function unwrap(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isTypeAssertionExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function product(parts: Set<string>[]): Set<string> {
  return parts.reduce(
    (acc, part) =>
      new Set([...acc].flatMap(prefix => [...part].map(s => prefix + s))),
    new Set(['']),
  );
}

/**
 * The tool calls of the plugin whose source is `srcDir`: what they can call
 * and what could not be worked out. `UnresolvedToolName`s name files relative
 * to `srcDir`, with `/` separators.
 */
export function collectToolCalls(srcDir: string): PluginToolCalls {
  const files = sourceFiles(srcDir);
  const program = ts.createProgram(files, compilerOptions());
  const checker = program.getTypeChecker();
  const own = files
    .map(file => program.getSourceFile(file))
    .filter((file): file is ts.SourceFile => file !== undefined);

  const calls: ts.CallExpression[] = [];
  const jsxElements: ts.JsxOpeningLikeElement[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      calls.push(node);
    } else if (
      ts.isJsxOpeningElement(node) ||
      ts.isJsxSelfClosingElement(node)
    ) {
      jsxElements.push(node);
    }
    ts.forEachChild(node, visit);
  };
  own.forEach(visit);

  const declarationOf = (call: ts.CallExpression) => {
    const declaration = checker.getResolvedSignature(call)?.declaration;
    return declaration && !ts.isJSDocSignature(declaration)
      ? declaration
      : undefined;
  };

  const functionOfSymbol = (
    symbol: ts.Symbol | undefined,
  ): FunctionNode | undefined => {
    const target =
      symbol && symbol.flags & ts.SymbolFlags.Alias
        ? checker.getAliasedSymbol(symbol)
        : symbol;
    const declaration = target?.valueDeclaration;
    if (!declaration) {
      return undefined;
    }
    if (ts.isFunctionLike(declaration)) {
      return declaration;
    }
    if (
      ts.isVariableDeclaration(declaration) &&
      declaration.initializer &&
      ts.isFunctionLike(unwrap(declaration.initializer))
    ) {
      return unwrap(declaration.initializer) as FunctionNode;
    }
    return undefined;
  };

  const callersCache = new Map<FunctionNode, Caller[]>();
  const callersOf = (fn: FunctionNode): Caller[] => {
    let callers = callersCache.get(fn);
    if (!callers) {
      const name = functionName(fn);
      callers = [
        ...calls.filter(
          call =>
            (name === undefined || calleeName(call.expression) === name) &&
            declarationOf(call) === fn,
        ),
        ...jsxElements.filter(
          element =>
            (name === undefined ||
              element.tagName.getText() === name ||
              element.tagName.getText().endsWith(`.${name}`)) &&
            functionOfSymbol(checker.getSymbolAtLocation(element.tagName)) ===
              fn,
        ),
      ];
      callersCache.set(fn, callers);
    }
    return callers;
  };

  /** The string literal values of a node's type, or unresolvable. */
  const fromType = (node: ts.Node): Set<string> => {
    const type = checker.getTypeAtLocation(node);
    const constraint = checker.getBaseConstraintOfType(type) ?? type;
    const members = constraint.isUnion() ? constraint.types : [constraint];
    if (members.every(member => member.isStringLiteral())) {
      return new Set(
        members.map(member => (member as ts.StringLiteralType).value),
      );
    }
    throw new Unresolvable(node);
  };

  /** What `caller` passes for parameter `index`, property `prop` of it if set. */
  const argumentOf = (
    caller: Caller,
    index: number,
    prop: string | undefined,
    context: Context,
    node: ts.Node,
  ): Set<string> | undefined => {
    if (ts.isCallExpression(caller)) {
      const argument = caller.arguments[index];
      if (!argument || ts.isSpreadElement(argument)) {
        return undefined;
      }
      if (prop === undefined) {
        return evaluate(argument, context);
      }
      const object = unwrap(argument);
      if (!ts.isObjectLiteralExpression(object)) {
        throw new Unresolvable(node);
      }
      const property = object.properties.find(
        p => p.name && ts.isIdentifier(p.name) && p.name.text === prop,
      );
      if (!property) {
        return undefined;
      }
      if (ts.isPropertyAssignment(property)) {
        return evaluate(property.initializer, context);
      }
      if (ts.isShorthandPropertyAssignment(property)) {
        return evaluate(property.name, context);
      }
      throw new Unresolvable(property);
    }
    // A JSX element passes its attributes as the first parameter's props.
    if (index !== 0 || prop === undefined) {
      throw new Unresolvable(node);
    }
    const attribute = caller.attributes.properties.find(
      a => ts.isJsxAttribute(a) && a.name.getText() === prop,
    ) as ts.JsxAttribute | undefined;
    if (!attribute) {
      if (caller.attributes.properties.some(ts.isJsxSpreadAttribute)) {
        throw new Unresolvable(caller);
      }
      return undefined;
    }
    const initializer = attribute.initializer;
    if (initializer && ts.isStringLiteral(initializer)) {
      return new Set([initializer.text]);
    }
    if (
      initializer &&
      ts.isJsxExpression(initializer) &&
      initializer.expression
    ) {
      return evaluate(initializer.expression, context);
    }
    throw new Unresolvable(attribute);
  };

  /** A parameter, or a property destructured from one, of `fn`. */
  const fromParameter = (
    parameter: ts.ParameterDeclaration,
    prop: string | undefined,
    initializer: ts.Expression | undefined,
    context: Context,
    node: ts.Node,
  ): Set<string> => {
    const fn = parameter.parent;
    const caller = context.get(fn);
    if (!caller) {
      throw new NeedCaller(fn, node);
    }
    const passed = argumentOf(
      caller,
      fn.parameters.indexOf(parameter),
      prop,
      context,
      node,
    );
    if (passed) {
      return passed;
    }
    if (initializer) {
      return evaluate(initializer, context);
    }
    throw new Unresolvable(node);
  };

  const fromIdentifier = (
    identifier: ts.Identifier,
    context: Context,
  ): Set<string> => {
    let symbol = checker.getSymbolAtLocation(identifier);
    if (symbol && symbol.flags & ts.SymbolFlags.Alias) {
      symbol = checker.getAliasedSymbol(symbol);
    }
    const declaration = symbol?.valueDeclaration ?? symbol?.declarations?.[0];
    if (!declaration) {
      return fromType(identifier);
    }
    if (ts.isParameter(declaration) && ts.isIdentifier(declaration.name)) {
      return fromParameter(
        declaration,
        undefined,
        declaration.initializer,
        context,
        identifier,
      );
    }
    if (
      ts.isBindingElement(declaration) &&
      ts.isObjectBindingPattern(declaration.parent) &&
      ts.isParameter(declaration.parent.parent) &&
      !declaration.dotDotDotToken
    ) {
      const prop = declaration.propertyName ?? declaration.name;
      if (ts.isIdentifier(prop)) {
        return fromParameter(
          declaration.parent.parent,
          prop.text,
          declaration.initializer,
          context,
          identifier,
        );
      }
    }
    if (
      ts.isVariableDeclaration(declaration) &&
      declaration.initializer &&
      ts.isIdentifier(declaration.name) &&
      ts.getCombinedNodeFlags(declaration) & ts.NodeFlags.Const
    ) {
      return evaluate(declaration.initializer, context);
    }
    return fromType(identifier);
  };

  const fromProperty = (
    expression: ts.PropertyAccessExpression | ts.ElementAccessExpression,
    context: Context,
  ): Set<string> => {
    const name = ts.isPropertyAccessExpression(expression)
      ? expression.name
      : expression.argumentExpression;
    const declaration = checker.getSymbolAtLocation(name)?.valueDeclaration;
    if (declaration && ts.isPropertyAssignment(declaration)) {
      return evaluate(declaration.initializer, context);
    }
    return fromType(expression);
  };

  /** What a call returns: its function's return expressions. */
  const fromCall = (call: ts.CallExpression, context: Context) => {
    const fn = declarationOf(call);
    if (!fn || !('body' in fn) || !fn.body) {
      return fromType(call);
    }
    const body = fn.body as ts.Node;
    const inner = new Map(context).set(fn, call);
    if (!ts.isBlock(body)) {
      return evaluate(body as ts.Expression, inner);
    }
    const returns: ts.Expression[] = [];
    const findReturns = (node: ts.Node) => {
      if (ts.isReturnStatement(node) && node.expression) {
        returns.push(node.expression);
      } else if (!ts.isFunctionLike(node)) {
        ts.forEachChild(node, findReturns);
      }
    };
    findReturns(body);
    if (returns.length === 0) {
      throw new Unresolvable(call);
    }
    return new Set(returns.flatMap(r => [...evaluate(r, inner)]));
  };

  const inPlugin = (node: ts.Node) =>
    path
      .resolve(node.getSourceFile().fileName)
      .startsWith(path.resolve(srcDir) + path.sep);

  /**
   * What `node` can be. A name that cannot be worked out in another package
   * is reported where the plugin reaches it.
   */
  function evaluate(node: ts.Expression, context: Context): Set<string> {
    try {
      return evaluateNode(node, context);
    } catch (error) {
      if (
        error instanceof Unresolvable &&
        !inPlugin(error.node) &&
        inPlugin(node)
      ) {
        throw new Unresolvable(node);
      }
      throw error;
    }
  }

  function evaluateNode(node: ts.Expression, context: Context): Set<string> {
    const expression = unwrap(node);
    if (ts.isStringLiteralLike(expression)) {
      return new Set([expression.text]);
    }
    if (ts.isTemplateExpression(expression)) {
      return product([
        new Set([expression.head.text]),
        ...expression.templateSpans.flatMap(span => [
          evaluate(span.expression, context),
          new Set([span.literal.text]),
        ]),
      ]);
    }
    if (
      ts.isBinaryExpression(expression) &&
      expression.operatorToken.kind === ts.SyntaxKind.PlusToken
    ) {
      return product([
        evaluate(expression.left, context),
        evaluate(expression.right, context),
      ]);
    }
    if (ts.isConditionalExpression(expression)) {
      return new Set([
        ...evaluate(expression.whenTrue, context),
        ...evaluate(expression.whenFalse, context),
      ]);
    }
    if (ts.isIdentifier(expression)) {
      return fromIdentifier(expression, context);
    }
    if (
      ts.isPropertyAccessExpression(expression) ||
      ts.isElementAccessExpression(expression)
    ) {
      return fromProperty(expression, context);
    }
    if (ts.isCallExpression(expression)) {
      return fromCall(expression, context);
    }
    return fromType(expression);
  }

  const location = (node: ts.Node): UnresolvedToolName => {
    const file = path
      .relative(srcDir, node.getSourceFile().fileName)
      .split(path.sep)
      .join('/');
    return `${file}: ${node.getText()}`;
  };

  /** Every name `expression` can be, through every caller it depends on. */
  const resolve = (expression: ts.Expression, context: Context) => {
    const tools = new Set<string>();
    const unresolved = new Set<UnresolvedToolName>();
    try {
      evaluate(expression, context).forEach(tool => tools.add(tool));
    } catch (error) {
      if (error instanceof Unresolvable) {
        unresolved.add(location(error.node));
      } else if (error instanceof NeedCaller) {
        const callers = callersOf(error.fn);
        if (callers.length === 0) {
          try {
            fromType(error.node).forEach(tool => tools.add(tool));
          } catch {
            unresolved.add(location(error.node));
          }
        }
        for (const caller of callers) {
          const inner = resolve(
            expression,
            new Map(context).set(error.fn, caller),
          );
          inner.tools.forEach(tool => tools.add(tool));
          inner.unresolved.forEach(u => unresolved.add(u));
        }
      } else {
        throw error;
      }
    }
    return { tools, unresolved };
  };

  const isToolMethod = (call: ts.CallExpression) => {
    const name = calleeName(call.expression);
    if (name === undefined || !TOOL_METHODS.has(name)) {
      return false;
    }
    const declaration = declarationOf(call);
    return (
      declaration !== undefined &&
      functionName(declaration) === name &&
      path
        .resolve(declaration.getSourceFile().fileName)
        .startsWith(MUSTER_APIS + path.sep)
    );
  };

  const tools = new Set<string>();
  const unresolved = new Set<UnresolvedToolName>();
  for (const call of calls.filter(isToolMethod)) {
    const [name] = call.arguments;
    if (!name) {
      unresolved.add(location(call));
      continue;
    }
    const result = resolve(name, new Map());
    result.tools.forEach(tool => tools.add(tool));
    result.unresolved.forEach(u => unresolved.add(u));
  }
  return { tools: [...tools].sort(), unresolved: [...unresolved].sort() };
}

/**
 * What a plugin's guard checks, as lists the test expects empty: the tools
 * called with no handler and not listed as not served; the listed ones that
 * are answered or no longer called; the unresolved names not listed; and the
 * listed unresolved names that now resolve.
 */
export function fixtureToolCoverage(options: {
  srcDir: string;
  /** The full tool names fixture mode answers (`fixtureToolNames`). */
  handled: ReadonlySet<string>;
  /** The tools called that fixture mode does not answer, on purpose. */
  notServed: ReadonlySet<string>;
  /** The tool names that cannot be worked out, on purpose. */
  unresolved: ReadonlySet<UnresolvedToolName>;
}) {
  const calls = collectToolCalls(options.srcDir);
  return {
    calls,
    missing: calls.tools.filter(
      tool => !options.handled.has(tool) && !options.notServed.has(tool),
    ),
    staleNotServed: [...options.notServed].filter(
      tool => !calls.tools.includes(tool) || options.handled.has(tool),
    ),
    unresolved: calls.unresolved.filter(u => !options.unresolved.has(u)),
    staleUnresolved: [...options.unresolved].filter(
      u => !calls.unresolved.includes(u),
    ),
  };
}
