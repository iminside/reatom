import { declareAction as a } from '@reatom/core'

const myAction0 = a()
const myAction1 = a('notMyAction')
const myAction2 = a('notMyAction', [() => {}])
const myAction3 = a(['notMyAction'], [() => {}])
const myAction4 = declareAction()
