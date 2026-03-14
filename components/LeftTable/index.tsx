'use client'
import AlertDialogDemo from '../Dialog';
import { MenubarDemo } from '../Menu';
import TableSelectableRowDemo from '../Table';
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import useViewModel from './useViewModel'
import { Search, Plus } from 'lucide-react';

export default function LefTable() {
    const vm = useViewModel()
    return (
        <div className='border'>
            <div className='flex flex-row gap-2 justify-between bg-gray-100 p-2'>
                <div className='flex flex-row'>
                    <Input onChange={vm.handleSearch}  placeholder='Search' className="px-3 p-2 border rounded !bg-white" />
                    <Button variant="default" size="icon" className='bg-white rounded-tl-none rounded-bl-none text-black border border-gray'>
                        <Search />
                    </Button>
                </div>
                <div className='flex flex-row gap-2'>
                    <Button onClick={() => vm.setIsOpenDialog(true)} variant="default" className='bg-[#F77F00] text-white'>
                        <Plus data-icon="inline-start" /> ADD SCHEDULE
                    </Button>
                    <div>
                        <MenubarDemo />
                    </div>
                </div>

            </div>
            <div className=''>
                <TableSelectableRowDemo value={vm.value}/>
            </div>

             <AlertDialogDemo isOpen={vm.isOpenDialog} dataOut={(op) => vm.handleModalClose(op)} data={[]} type='add' title='Add Reappointment Schedule'/>
        </div>
    )
}
