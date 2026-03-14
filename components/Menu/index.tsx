import {
  Menubar,
  MenubarContent,
  MenubarGroup,
  MenubarItem,
  MenubarMenu,
  MenubarTrigger,
} from "@/components/ui/menubar"
import { Users, ChevronDown } from "lucide-react"

export function MenubarDemo() {
  return (
    <Menubar className="bg-white">
      <MenubarMenu>
        <MenubarTrigger className="w-full hover:bg-white">
          <Users className="mr-2 h-4 w-4" />
          ADD TO GROUP
          <ChevronDown className="mr-2 h-4 w-4" />
        </MenubarTrigger>
        <MenubarContent>
          <MenubarGroup>
            <MenubarItem >Andy</MenubarItem>
            <MenubarItem >Benoit</MenubarItem>
            <MenubarItem >Luis</MenubarItem>
          </MenubarGroup>
        </MenubarContent>
      </MenubarMenu>
    </Menubar>
  )
}
