import { useEffect } from 'react'
import { useHelp, HelpItem } from '../contexts/HelpContext'

interface Props {
  items: HelpItem[]
  title?: string
}

export default function HelpPanel({ items, title = 'How this page works' }: Props) {
  const { setHelp } = useHelp()
  useEffect(() => {
    setHelp(items, title)
    return () => setHelp([])
  }, [items, title, setHelp])
  return null
}
