const randomVector = (r) => [r / 2 - Math.random() * 5 * r, r / 2 - Math.random() * r, r / 2 - Math.random() * r]
const staticVector = (r) => [r / 2 - Math.random() * 5 * r + 10, 100 + 6 * Math.random(), r / 2 - Math.random() * (5 * r) - 5]
const data = Array.from({ length: 1000 }, (r = 10) => ({ random: Math.random(), position: randomVector(r), rotation: [0,0,0] }))
const surface = Array.from({ length: 1000 }, (r = 10) => ({ random: Math.random(), position: staticVector(r), rotation: [0,0,0] }))

export { data, surface }