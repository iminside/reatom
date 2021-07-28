import { test } from 'uvu'
import * as assert from 'uvu/assert'

import {
  ActionCreator,
  createStore,
  createTransaction,
  createActionCreator,
  createAtom,
  Fn,
  isFunction,
  Store,
} from '@reatom/core'
import { createResource, atom, init } from '@reatom/core/experiments'

let noop: Fn = () => {}

const sleep = (ms = 0) => new Promise((r) => setTimeout(r, ms))

export function mockFn<I extends any[], O>(
  fn: Fn<I, O> = (...i: any) => void 0 as any,
) {
  const _fn = Object.assign(
    function (...i: I) {
      // @ts-ignore
      const o = fn.apply(this, i)

      _fn.calls.push({ i, o })

      return o
    },
    {
      calls: new Array<{ i: I; o: O }>(),
      lastInput(): I[0] {
        const { length } = _fn.calls
        if (length === 0) throw new TypeError(`Array is empty`)
        return _fn.calls[length - 1].i[0]
      },
    },
  )

  return _fn
}

test(`displayName`, () => {
  const firstNameAtom = atom(
    'John',
    {
      set: (state, name: string) => name,
      setFullName: (state, fullName: string) => fullName.split(' ')[0],
    },
    { id: `firstName` },
  )

  const lastNameAtom = createAtom(
    {},
    ($, state = 'Doe') => {
      $(
        firstNameAtom.setFullName,
        (fullName) => (state = fullName.split(' ')[1]),
      )

      return state
    },
    { id: `lastName` },
  )

  const isFirstNameShortAtom = createAtom(
    {},
    ($) => $(firstNameAtom).length < 10,
    { id: `isFirstNameShort` },
  )

  const fullNameAtom = createAtom(
    {},
    ($) => `${$(firstNameAtom)} ${$(lastNameAtom)}`,
    { id: `fullName` },
  )

  const displayNameAtom = createAtom(
    {},
    ($) => ($(isFirstNameShortAtom) ? $(fullNameAtom) : $(firstNameAtom)),
    { id: `displayName` },
  )

  const store = createStore()

  const cb = mockFn()

  store.subscribe(displayNameAtom, cb)

  assert.is(cb.calls.length, 1)
  assert.is(cb.lastInput(), 'John Doe')

  store.dispatch(firstNameAtom.set('John'))
  assert.is(cb.calls.length, 1)
  assert.is(cb.lastInput(), 'John Doe')

  store.dispatch(firstNameAtom.set('Joe'))
  assert.is(cb.calls.length, 2)
  assert.is(cb.lastInput(), 'Joe Doe')

  store.dispatch(firstNameAtom.set('Joooooooooooooooooooe'))
  assert.is(cb.calls.length, 3)
  assert.is(cb.lastInput(), 'Joooooooooooooooooooe')

  store.dispatch(firstNameAtom.set('Joooooooooooooooooooe'))
  assert.is(cb.calls.length, 3)
  assert.is(cb.lastInput(), 'Joooooooooooooooooooe')

  console.log(`👍`)
})

test(`combine`, () => {
  const aAtom = atom(0)
  const bAtom = createAtom({}, ($) => $(aAtom) % 2)
  const cAtom = createAtom({}, ($) => $(aAtom) % 2)
  const bcAtom = createAtom({}, ($) => ({
    b: $(bAtom),
    c: $(cAtom),
  }))
  const store = createStore()

  init([bcAtom], store)

  const bsState1 = store.getState(bcAtom)
  assert.is(store.getState(aAtom), 0)
  assert.equal(bsState1, { b: 0, c: 0 })

  store.dispatch(aAtom.update((s) => s + 1))
  const bsState2 = store.getState(bcAtom)
  assert.is(store.getState(aAtom), 1)
  assert.equal(bsState2, { b: 1, c: 1 })

  store.dispatch(aAtom.update((s) => s + 2))
  const bsState3 = store.getState(bcAtom)
  assert.is(store.getState(aAtom), 3)
  assert.equal(bsState3, { b: 1, c: 1 })
  assert.is(bsState2, bsState3)

  console.log(`👍`)
})

test(`atom id`, () => {
  const a = atom(1, null, { id: `a` })
  const b = createAtom({}, ($, s = 2) => s, { id: `b` })
  const c = createAtom({}, ($) => $(a), { id: `c` })
  const store = createStore()

  init([a, b, c], store)

  assert.equal(store.getState(), { a: 1, b: 2, c: 1 })

  console.log(`👍`)
})

test(`action mapper`, () => {
  const action = createActionCreator((payload: number) => ({
    payload: payload + 1,
  }))
  assert.is(action(1).payload, 2)

  console.log(`👍`)
})

test(`atom filter`, () => {
  const track = mockFn()
  const a1Atom = atom(0, null, { id: `a1Atom` })
  const a2Atom = atom(0, null, { id: `a2Atom` })
  const bAtom = createAtom({}, ($, s = 0) => {
    track()

    const a = $(a1Atom)
    if (a % 2) s = a

    $(a2Atom, (v) => (s = v))

    return s
  })

  const bCache1 = bAtom(createTransaction([]))
  assert.is(track.calls.length, 1)
  assert.is(bCache1.state, 0)

  const bCache2 = bAtom(createTransaction([]), bCache1)
  assert.is(track.calls.length, 1)
  assert.is(bCache1, bCache2)
  assert.is(bCache1, bCache2)

  const bCache3 = bAtom(createTransaction([a1Atom.update(0)]), bCache2)
  assert.is(track.calls.length, 1)
  assert.is(bCache2, bCache3)
  assert.is(bCache3.state, 0)
  assert.is(bCache2.state, bCache3.state)

  const bCache4 = bAtom(createTransaction([a1Atom.update(1)]), bCache3)
  assert.is(track.calls.length, 2)
  assert.is.not(bCache3, bCache4)
  assert.is(bCache4.state, 1)
  assert.is.not(bCache3.state, bCache4.state)

  const bCache5 = bAtom(
    createTransaction([a1Atom.update((s) => s + 2)]),
    bCache4,
  )
  assert.is(track.calls.length, 3)
  assert.is.not(bCache4, bCache5)
  assert.is(bCache5.state, 3)
  assert.is.not(bCache4.state, bCache5.state)

  console.log(`👍`)
})

test(`in atom action effect`, async () => {
  function createResource<I, O>(fetcher: (params: I) => Promise<O>) {
    const resourceAtom = createAtom(
      {
        request: (payload: I) => payload,
        response: (payload: O | Error) => payload,
      },
      ($, state = null as null | O | Error) => {
        $({
          request(payload: I) {
            $.effect(({ dispatch }) =>
              fetcher(payload)
                .then((data) => dispatch($.action('response', data)))
                .catch((e) =>
                  dispatch(
                    $.action('response', e instanceof Error ? e : new Error(e)),
                  ),
                ),
            )
          },
          response(payload: O | Error) {
            state = payload
          },
        })

        return state
      },
    )

    return resourceAtom
  }

  const dataAtom = createResource((params: void) => Promise.resolve([]))
  const cb = mockFn()

  const store = createStore()

  store.subscribe(dataAtom, cb)
  assert.is(cb.calls.length, 1)
  assert.is(cb.lastInput(), null)

  store.dispatch(dataAtom.request())
  assert.is(cb.calls.length, 1)
  await sleep()
  assert.is(cb.calls.length, 2)
  assert.equal(cb.lastInput(), [])

  console.log(`👍`)
})

test(`action effect example`, () => {
  function handleEffects(store: Store) {
    store.subscribe(({ actions }) =>
      actions.forEach(({ effect }) => isFunction(effect) && effect(store)),
    )
  }

  const effect = mockFn()
  const doEffect = createActionCreator(() => ({
    payload: null,
    effect,
  }))
  const store = createStore()

  handleEffects(store)

  store.dispatch(doEffect())

  assert.is(effect.calls.length, 1)
  assert.is(effect.lastInput(), store)

  console.log(`👍`)
})

test(`Atom store dependency states`, () => {
  const aTrack = mockFn()
  const incrementA = createActionCreator()
  const noopAction = createActionCreator()
  const aAtom = createAtom({}, ($, state = 1) => {
    aTrack()
    $(incrementA, () => (state += 1))
    return state
  })
  const bAtom = createAtom({}, ($) => $(aAtom) + 1)

  const bCache1 = bAtom(createTransaction([noopAction()]))
  assert.is(aTrack.calls.length, 1)

  const bCache2 = bAtom(createTransaction([noopAction()]), bCache1)
  assert.is(aTrack.calls.length, 1)
  assert.is(bCache1, bCache2)

  assert.is(bCache2.state, 2)
  const bCache3 = bAtom(createTransaction([incrementA()]), bCache1)
  assert.is(aTrack.calls.length, 2)
  assert.is(bCache3.state, 3)

  console.log(`👍`)
})

test(`Atom from`, () => {
  const a = atom(42)

  assert.is(a(createTransaction([createActionCreator()()])).state, 42)
  assert.is(a(createTransaction([a.update(43)])).state, 43)
  assert.is(a(createTransaction([a.update((s) => s + 2)])).state, 44)

  console.log(`👍`)
})

test(`Store preloaded state`, () => {
  const a = atom(0)
  const snapshotLessStore = createStore()
  const snapshotFullStore = createStore({
    snapshot: { [a.id]: 42 },
  })

  assert.is(snapshotLessStore.getState(a), 0)
  assert.is(snapshotFullStore.getState(a), 42)

  init([a], snapshotLessStore)
  init([a], snapshotFullStore)

  assert.is(snapshotLessStore.getState(a), 0)
  assert.is(snapshotFullStore.getState(a), 42)

  snapshotLessStore.dispatch(a.update((s) => s + 1))
  snapshotFullStore.dispatch(a.update((s) => s + 1))

  assert.is(snapshotLessStore.getState(a), 1)
  assert.is(snapshotFullStore.getState(a), 43)

  console.log(`👍`)
})

test(`Batched dispatch`, () => {
  const a = atom(0)
  const store = createStore()
  const cb = mockFn()

  store.subscribe(a, cb)

  assert.is(cb.calls.length, 1)

  store.dispatch([a.update((s) => s + 1), a.update((s) => s + 1)])
  assert.is(cb.calls.length, 2)
  assert.is(cb.lastInput(), 2)

  console.log(`👍`)
})

test(`Batched dispatch dynamic types change`, () => {
  let reducerCalls = 0
  const doSome = createActionCreator<any>()
  const addAction = createActionCreator<ActionCreator>()
  const actionsCacheAtom = createAtom(
    {},
    ($, state = new Array<readonly [ActionCreator, any]>()) => {
      reducerCalls++
      $(
        addAction,
        (actionCreator) => (state = [...state, [actionCreator, null]]),
      )

      return state.map(([actionCreator, payload = null]) => {
        $(actionCreator, (v) => (payload = v))
        return [actionCreator, payload] as const
      })
    },
  )
  const store = createStore()

  init([actionsCacheAtom], store)
  assert.is(reducerCalls, 1)

  store.dispatch([addAction(doSome), doSome(0)])
  assert.equal(store.getState(actionsCacheAtom), [[doSome, 0]])
  assert.is(reducerCalls, 2)

  console.log(`👍`)
})

test(`async collection of transaction.effectsResult`, async () => {
  const doA = createActionCreator()
  const doB = createActionCreator()

  const resourceDataAtom = atom(0)
  const resourceAtom = createAtom({}, ($) => {
    $(doA, () =>
      $.effect(async ({ dispatch }) => {
        await sleep(10)
        await dispatch(doB())
      }),
    )

    $(doB, () =>
      $.effect(async ({ dispatch }) => {
        await sleep(10)
        await dispatch(resourceDataAtom.update((s) => s + 1))
      }),
    )

    return $(resourceDataAtom)
  })

  const store = createStore()
  const cb = mockFn()

  init([resourceAtom], store)

  store.dispatch(doA()).then(cb)

  assert.is(cb.calls.length, 0)

  await sleep(10)

  assert.is(cb.calls.length, 0)

  await sleep(10)

  assert.is(cb.calls.length, 1)

  console.log(`👍`)
})

test(`createResource`, async () => {
  const resourceAtom = createResource(
    ($, state = [0]) => state,
    (param: number) =>
      typeof param === 'number'
        ? Promise.resolve([param])
        : Promise.reject(new Error(param)),
  )

  const store = createStore()
  const cb = mockFn()

  store.subscribe(resourceAtom, cb)
  assert.is(cb.calls.length, 1)
  assert.equal(cb.lastInput(), { data: [0], error: null, isLoading: false })

  store.dispatch(resourceAtom.fetch(42))
  assert.is(cb.calls.length, 2)
  assert.equal(cb.lastInput(), { data: [0], error: null, isLoading: true })
  await sleep()
  assert.is(cb.calls.length, 3)
  assert.equal(cb.lastInput(), { data: [42], error: null, isLoading: false })

  // `get` with same params should do nothing
  const state = store.getState(resourceAtom)
  store.dispatch(resourceAtom.fetch(42))
  assert.is(cb.calls.length, 3)
  assert.equal(cb.lastInput(), state)

  // `req` with same params should force refetch
  store.dispatch(resourceAtom.invalidate(42))
  assert.is(cb.calls.length, 4)
  await sleep()
  assert.is(cb.calls.length, 5)
  assert.equal(cb.lastInput(), state)

  // error should handled and stored
  store.dispatch(resourceAtom.invalidate('42' as any))
  assert.is(cb.calls.length, 6)
  await sleep()
  assert.is(cb.calls.length, 7)
  assert.equal(cb.lastInput(), {
    data: [42],
    error: new Error('42'),
    isLoading: false,
  })

  // concurrent requests should proceed only one response
  store.dispatch(resourceAtom.invalidate(1))
  store.dispatch(resourceAtom.invalidate(2))
  store.dispatch(resourceAtom.invalidate(3))
  assert.is(cb.calls.length, 8)
  await sleep()
  assert.is(cb.calls.length, 9)
  assert.equal(cb.lastInput(), { data: [3], error: null, isLoading: false })

  console.log(`👍`)
})

test(`subscription to in-cache atom`, () => {
  const a = atom(0)
  const b = createAtom({}, ($) => $(a))

  const trackA = mockFn()
  const trackB = mockFn()

  b.subscribe(trackB)

  assert.is(trackA.calls.length, 0)
  assert.is(trackB.calls.length, 1)

  a.update.dispatch((s) => s + 1)
  assert.is(trackB.calls.length, 2)

  a.subscribe(trackA)
  assert.is(trackA.calls.length, 1)
  assert.is(trackB.calls.length, 2)

  a.update.dispatch((s) => s + 1)
  assert.is(trackA.calls.length, 2)
  assert.is(trackB.calls.length, 3)

  console.log(`👍`)
})

test(`getState of stale atom`, () => {
  const a = atom(0)
  const b = createAtom({}, ($) => $(a))

  const un = b.subscribe(noop)

  assert.is(a.getState(), 0)
  assert.is(b.getState(), 0)

  a.update.dispatch(1)
  assert.is(a.getState(), 1)
  assert.is(b.getState(), 1)

  un()
  a.update.dispatch(2)
  assert.is(a.getState(), 2)
  assert.is(b.getState(), 2)
})

// test(`stack`, async () => {
//   type TrafficLight = { delay: number; isOn: boolean, state: 'red' | 'yellow' | 'green' }
//   const trafficLightAtom = createAtom(
//     {
//       setDelay: (delay: number) => delay,
//       turnOff: () => null,
//       turnOn: () => null,
//     },
//     ($, state: TrafficLight = { delay: 100, isOn: true, state: 'red' }) => {

//       $({
//         setDelay: (delay) => state = {...state, delay}
//         toggle: () => state = {...state, delay}
//       })

//       return state
//     },
//   )

//   const store = createStore()

//   // store.subscribe(({ actions }) => {
//   //   console.log(actions)
//   // })

//   store.dispatch(dataAtom.fetch(2))
// })

test.run()
