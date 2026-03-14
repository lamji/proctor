import React from 'react'

export default function AddReappointment({totalPoints}:any) {

    /**
     * RPG game that assign points based on streght and speed attribute of character
     * ex totalPoints is 5 
     * if strength is add it minus the total points
     * if stringth is already 5 total points become 0
     * if speed add plus 1 this will reduce 1 from strhgth until strength become 0 and speed become 5
     * Now clicking speed minu, ite will minu from speed and add on totalPoints untill speed 0 and total points is 5
     */
    return (
        <div>
            Character stats: <span>{totalPoints}</span> points
            <div>
                <button>-</button>
                <input
                    type="number"
                    step="1"
                    style={{ width: "50px", textAlign: "center" }}
                    readOnly
                />
                <button>+</button>
                Strength
            </div>
            <div>
                <button>-</button>
                <input
                    type="number"
                    step="1"
                    style={{ width: "50px", textAlign: "center" }}
                    readOnly
                />
                <button>+</button>
                Speed
            </div>
        </div>
    );
}
