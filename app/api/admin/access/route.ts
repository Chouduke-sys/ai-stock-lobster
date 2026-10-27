import {NextResponse} from "next/server";
import {adminIdentity} from "../../../../lib/admin-access";
export async function GET(){return NextResponse.json({isAdmin:Boolean(await adminIdentity())},{headers:{"Cache-Control":"private, no-store"}});}
