import { useId, useMemo, useState } from 'react'

import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { Button } from '../ui/button'
import { ChevronRight , ChevronLeft, Trash, Pencil} from 'lucide-react';
import AlertDialogDemo from '../Dialog';

type TableItem = {
  id: string
  name: string
  entity: string
  date: string
  status: string
}

export const items: TableItem[] = [
  {
    id: '1',
    name: 'Philip George',
    entity: 'Alibama Branch',
    date: '2026-03-27',
    status: 'Active',
  },
  {
    id: '2',
    name: 'Sarah Chen',
    entity: 'Test Branch',
    date: '2026-03-21',
    status: 'Active',

  },

]

type TableTypes = {
  value: string
}

const TableSelectableRowDemo = ({value}: TableTypes) => {
  const id = useId()
  const [removedItemIds, setRemovedItemIds] = useState<string[]>([])
  const [activeEditData, setActiveEditData] = useState<TableItem[]>([])
  const [isOpenDialog, setIsOpenDialog] = useState<boolean>(false)

  const tableData = useMemo(() => {
    const idStr = value.toLocaleLowerCase()

    return items.filter((data) => {
      const matchNameOrEntity =
        data.name.toLocaleLowerCase().includes(idStr) ||
        data.entity.toLocaleLowerCase().includes(idStr)
      const isRemoved = removedItemIds.includes(data.id)

      return matchNameOrEntity && !isRemoved
    })
  }, [removedItemIds, value])

  const handleDelete = (id: string) => {
    setRemovedItemIds((prevState) => [...prevState, id])
  }

  const handleEdit = (id: string) => {
    const newTableData = tableData.filter((data) => data.id === id)
    setIsOpenDialog(true)
    setActiveEditData(newTableData)
  }

  const handleModalClose = (op: boolean) => {
    setIsOpenDialog(op)
  }

  return (
    <div className='w-full'>
      <div className='overflow-hidden h-[50vh]'>
        <Table>
          <TableHeader>
            <TableRow className='hover:bg-transparent'>
              <TableHead>
                <Checkbox id={id} aria-label='select-all' />
              </TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Reappointment Due Date</TableHead>
              <TableHead>Action</TableHead>
              
            </TableRow>
          </TableHeader>
          <TableBody>
            {tableData.map(item => (
              <TableRow key={item.id} className='has-data-[state=checked]:bg-muted/50'>
                <TableCell>
                  <Checkbox id={`table-checkbox-${item.id}`} aria-label={`user-checkbox-${item.id}`} />
                </TableCell>
                <TableCell className='font-medium'>{item.name}</TableCell>
                <TableCell>{item.entity}</TableCell>
                <TableCell>{item.date}</TableCell>
                <TableCell> 
                  <Button onClick={() =>  handleEdit(item.id)} variant="ghost">
                    <Pencil />
                  </Button>
                  <Button onClick={() =>  handleDelete(item.id)} variant="ghost">
                    <Trash />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
       {/* Pagination moved outside the table */}
    <div className='border border-r-0 border-l-0 p-2 flex justify-between items-center'>
      <span className='text-sm text-muted-foreground'>
        {`1-3 of 3`}
      </span>
      <div className='flex gap-1'>
        <Button variant="ghost" size="sm">
          <ChevronLeft className='h-4 w-4' />
        </Button>
        <Button variant="ghost" size="sm">
          <ChevronRight className='h-4 w-4' />
        </Button>
      </div>
    </div>
      <AlertDialogDemo isOpen={isOpenDialog} dataOut={(op) => handleModalClose(op)} data={activeEditData} type='edit' title='Edit Reappointment Schedule'/>
    </div>
  )
}

export default TableSelectableRowDemo
