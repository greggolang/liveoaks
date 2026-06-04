import { createContext, useCallback, useContext, useState } from 'react'

export interface HelpItem {
  heading: string
  body: string | React.ReactNode
}

interface HelpContextValue {
  helpItems: HelpItem[]
  helpTitle: string
  setHelp: (items: HelpItem[], title?: string) => void
}

const HelpContext = createContext<HelpContextValue>({
  helpItems: [],
  helpTitle: 'How this page works',
  setHelp: () => {},
})

export function HelpProvider({ children }: { children: React.ReactNode }) {
  const [helpItems, setHelpItems] = useState<HelpItem[]>([])
  const [helpTitle, setHelpTitle] = useState('How this page works')

  const setHelp = useCallback((items: HelpItem[], title = 'How this page works') => {
    setHelpItems(items)
    setHelpTitle(title)
  }, [])

  return (
    <HelpContext.Provider value={{ helpItems, helpTitle, setHelp }}>
      {children}
    </HelpContext.Provider>
  )
}

export function useHelp() {
  return useContext(HelpContext)
}
