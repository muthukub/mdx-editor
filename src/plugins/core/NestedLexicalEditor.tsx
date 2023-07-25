/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { $getRoot, LexicalEditor, createEditor } from 'lexical'
import * as Mdast from 'mdast'
import { Node } from 'unist'
import React from 'react'
import { corePluginHooks } from './realmPlugin'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import LexicalErrorBoundary from '@lexical/react/LexicalErrorBoundary'
import { LexicalNestedComposer } from '@lexical/react/LexicalNestedComposer'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { theme } from '../../content/theme'
import { exportLexicalTreeToMdast } from '../../export/exportMarkdownFromLexical'
import { importMdastTreeToLexical } from '../../import/importMarkdownToLexical'
import styles from '../../ui/styles.module.css'
// TODO:
// import { SharedHistoryPlugin } from '../SharedHistoryPlugin'

interface NestedEditorsContextValue<T extends Node> {
  parentEditor: LexicalEditor
  mdastNode: T
  lexicalNode: {
    setMdastNode: (mdastNode: any) => void
  }
}

export const NestedEditorsContext = React.createContext<NestedEditorsContextValue<Node> | undefined>(undefined)

export const useNestedEditorContext = <T extends Mdast.Content>() => {
  const context = React.useContext(NestedEditorsContext) as NestedEditorsContextValue<T> | undefined
  if (!context) {
    throw new Error('useNestedEditor must be used within a NestedEditorsProvider')
  }
  return context
}

/**
 * A hook that returns a function that can be used to update the mdast node. Use this in your custom editor components.
 */
export function useMdastNodeUpdater<T extends Mdast.Content>() {
  const { parentEditor, lexicalNode, mdastNode } = useNestedEditorContext<T>()

  return function updateMdastNode(node: Partial<T>) {
    parentEditor.update(() => {
      lexicalNode.setMdastNode({ ...mdastNode, ...node })
    })
  }
}

/**
 * The properties of the {@link NestedEditor} React Component.
 * @typeParam T - The type of the mdast node of the editor.
 */
export interface NestedEditorProps<T extends Mdast.Content> {
  /**
   * A function that returns the phrasing content of the mdast node. In most cases, this will be the `children` property of the mdast node, but you can also have multiple nested nodes with their own children.
   */
  getContent: (mdastNode: T) => Mdast.PhrasingContent[]

  /**
   * A function that should return the updated mdast node based on the original mdast node and the new content (serialized as mdast tree) produced by the editor.
   */
  getUpdatedMdastNode: (mdastNode: T, children: Mdast.PhrasingContent[]) => T

  /**
   * Props passed to the {@link https://github.com/facebook/lexical/blob/main/packages/lexical-react/src/LexicalContentEditable.tsx | ContentEditable} component.
   */
  contentEditableProps?: React.ComponentProps<typeof ContentEditable>

  /**
   * Whether or not the editor edits blocks (multiple paragraphs)
   */
  block?: boolean
}

/**
 * A nested editor React component that allows editing of the contents of complex markdown nodes that have nested markdown content (for example, custom directives or JSX elements). See the {@link NestedEditorProps} for more details on the compoment props.
 *
 * @example
 * You can use a type param to specify the type of the mdast node
 *
 * ```tsx
 *
 * interface CalloutDirectiveNode extends LeafDirective {
 *   name: 'callout'
 *   children: Mdast.PhrasingContent[]
 * }
 *
 * return <NestedEditor<CalloutDirectiveNode> getContent={node => node.children} getUpdatedMdastNode={(node, children) => ({ ...node, children })} />
 * ```
 */
export const NestedLexicalEditor = function <T extends Mdast.Content>(props: NestedEditorProps<T>) {
  const { getContent, getUpdatedMdastNode, contentEditableProps, block = false } = props
  const { mdastNode } = useNestedEditorContext<T>()
  const updateMdastNode = useMdastNodeUpdater<T>()

  const [importVisitors, exportVisitors, usedLexicalNodes, jsxComponentDescriptors, jsxIsAvailable] = corePluginHooks.useEmitterValues(
    'importVisitors',
    'exportVisitors',
    'usedLexicalNodes',
    'jsxComponentDescriptors',
    'jsxIsAvailable'
  )

  const [editor] = React.useState(() => {
    const editor = createEditor({
      nodes: usedLexicalNodes,
      theme: theme
    })

    editor.update(() => {
      let content: Mdast.PhrasingContent[] | Mdast.Content[] = getContent(mdastNode as any)
      if (block) {
        if (content.length === 0) {
          content = [{ type: 'paragraph', children: [] }]
        }
      } else {
        content = [{ type: 'paragraph', children: content as Mdast.PhrasingContent[] }]
      }
      importMdastTreeToLexical({
        root: $getRoot(),
        mdastRoot: {
          type: 'root',
          children: content
        },
        visitors: importVisitors
      })
    })

    return editor
  })

  React.useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const mdast = exportLexicalTreeToMdast({
          root: $getRoot(),
          visitors: exportVisitors,
          jsxComponentDescriptors,
          jsxIsAvailable
        })
        const content: Mdast.Content[] = block ? mdast.children : (mdast.children[0] as Mdast.Paragraph)!.children
        updateMdastNode(getUpdatedMdastNode(mdastNode as any, content as any))
      })
    })
  }, [block, editor, exportVisitors, getUpdatedMdastNode, jsxComponentDescriptors, jsxIsAvailable, mdastNode, updateMdastNode])

  return (
    <LexicalNestedComposer initialEditor={editor}>
      <RichTextPlugin
        contentEditable={<ContentEditable {...contentEditableProps} className={styles.nestedEditor} />}
        placeholder={null}
        ErrorBoundary={LexicalErrorBoundary}
      />
    </LexicalNestedComposer>
  )
}