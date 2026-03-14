import { useState } from "react"
import { items } from "../Table"


export default function useViewModel() {
  
  const [value, setVal] = useState<string>("")
  const [isOpenDialog, setIsOpenDialog] = useState<boolean>(false)
  const data = items

  const handleSearch = (str: React.ChangeEvent<HTMLInputElement>) => {
      const val = str.target.value
      console.log(val)
      setVal(val)
  }

   const handleModalClose = (op: boolean) => {
    setIsOpenDialog(op)
  }
  
  return {
    test:"", 
    handleSearch,
    value,
    isOpenDialog,
    handleModalClose,
    setIsOpenDialog
  }
}
