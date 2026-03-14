import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useEffect, useState } from 'react'
import { Input } from '../ui/input'

type ReappointmentItem = {
    id?: string
    name?: string
    entity?: string
    date?: string
    status?: string
}

type DialogProps = {
    isOpen: boolean,
    dataOut: (open: boolean) => void,
    data: ReappointmentItem[],
    type?: "add" | "edit",
    title: string
}

const AlertDialogDemo = ({ isOpen, dataOut, data, type , title}: DialogProps) => {
    const [stateOpen, setStateOpen] = useState<boolean>(false)

    const dataIn = data[0]

    const handleClose = () => {
        setStateOpen(false)
        dataOut(false)
    }
    const handleSet = () => {

    }

    const handleInputChange = (e:React.ChangeEvent<HTMLInputElement>, typeIn:string) => {
        if(typeIn === "provider"){

        }else if(typeIn === "entity"){

        }else{

        }
    }

    useEffect(() => {
        setStateOpen(isOpen)
    }, [isOpen])



    console.log("testdata", data)
    return (
        <AlertDialog open={stateOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{title}</AlertDialogTitle>
                    {type === "edit" ?
                        <>
                            <div>
                                <p>SELECTED PROVIDER: <span style={{ fontWeight: "bold" }}>{dataIn?.name}</span></p>
                                <p>ENTITY: <span style={{ fontWeight: "bold" }}>{dataIn?.entity}</span></p>
                            </div>
                            <div>
                                <input value={dataIn?.date} onChange={(date) => console.log("date", date)} type='date' className='border p-2 rounded px-5 w-80' />
                            </div>
                        </>
                        :
                        <>
                            <div>
                           <Input onChange={(e:React.ChangeEvent<HTMLInputElement>) => handleInputChange(e, "provider")} required type='text' placeholder='Provider' className='max-w-xs' />
                            </div>
                            <div className='flex flex-row gap-2'>
                                 <Input required type='text' placeholder='Entity' className='max-w-xs' />
                                <Input required type='date' placeholder='Reappoint Due  Date' className='max-w-xs' />
                            </div>
                        </>
                    }

                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={handleClose}>CANCEL</AlertDialogCancel>
                    {/* TODO */}
                    <AlertDialogAction onClick={() => handleSet()}>SET</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}

export default AlertDialogDemo
