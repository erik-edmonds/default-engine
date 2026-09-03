# TODO:
- Transition splash screen 
- Add ambient beach music based on day
    - Day, people sounds?

# Small Tweaks needed
- [x] Current dot at location appears as soon as camera transition starts, it should wait until a few seconds after transition start
- [x] Rain hits screen on cloud click, but ends abruptly. Needs to slowly stop.
- [x] Aurora Borealis needs to transition out first, so there's no overlap with the dawn skyscene
- [x] Slowly transition in/out flame 

# ANIMATIONS!!!
- [ ] Models are all rigged, but no animations are created ..
- [ ] Animations to create
    - [ ] Idle base avatar
    - [ ] Spin base avatar
    - [ ] Walking scuba avatar
    - [ ] Jumping scuba avatar
    - [ ] Flying up dragonite avatar
    - [ ] Floating in air dragonite avatar

# Splash
- [x] Logo, that fills with color on percentage loaded

# Homepage 
- [x] Fix Camera rubix cube 
    - [x] Rotation moves it, while it should stay about 5% from the right and bottom edge
    - [x] Currently has logic to move on drag, but is very jerky and unnatural right now. Needs easing and spring reaction
- [ ] Add guassian blur in background? 
    - [ ] Focus follows the mouse
- [x] transition on change from sun/evening/night
    - [x] transition finished, but need an object to interact with to make it change.
        - [x] Object added, needs to be stylized, feels a bit boring.
            - [x] A cube that rotates, each face is a setting 
- [ ] Add frames on the islands
- [x] Dot nav added
    - [x] Needs background removed
    - [x] Needs to be stylized
        - [x] Joystick used now
    - [x] Functionality needed
- [x] fix music
- [x] scroll/click up to transform to sky, turn to dragonite suit and fly up. Travel stuff
    - [ ] Camera doesn't align properly when going up and not at home position
        - [ ] On any position, on arrow up/down: 
        should camera return to home position then transition
    - [x] On click, pokeball animation
        - [x] Pokeball opens up 
        - [x] White light like pokemon coming out of ball
        - [x] Avatar disappears behind white like
        - [x] Dragonite appears as well, so when white light is gone, Dragonite is left 
- [x] scroll/click down to go in water, turn to scuba and jump into water. Dive into y experiences
- [ ] Stylize up/down button
    - [ ] Maybe text boxes?
- [x] Add Dots over iteractive items
    - [x] On hover, have the outer ring pulse
    - [x] On hover, change color - 
    - [x] Add multiple dots on island and sky scene that the camera can move to?
    - [x] On rain from clouds, make screen appear wet as well
        - [x] Need to improve this some though, it shows up, but it's not transparent like rain.
            - SEE: https://jordan-breton.com/
- [x] Create logo
- [x] Bloom for sun and moon
    - [x] Bloom added but now texture doesn't show

# Fix Lighting
    - [x] Add ambient occlusion
    - [ ] clouds in sky scene has no lights
    - [x] on night the island looks too bright. It doesn't look like natural lighting
    - [x] during day there is a strong glare on the lake to the right side
    - [x] evening is pretty good, but the background needs to be improved

# About 
- [x] Add lens flare in morning or evening

# Portfolio
- [ ] Connect to homepage. This should be a single page app
- [ ] 4 Cards:
    - [ ] Make scenes with parts inside, and arts outside
    - [ ] Add scenes in cards 
        - [ ] gaussing splatting (Still relevant)
        - [ ] multi agent simulation
            - [ ] Carla integration
        - [ ] Visualization
            - [ ] Election 
        - [ ] Data Science
            - [ ] 

# PERFORMANCE!!!
- [x] Combine scene models (island, surfboard, ultraball, beach ball, mountain) into one scene
- [ ] Optimize for mobile
    - [ ] Fix joystick on rotate mode on mobile


# Extras
- [ ] Moon follows monthly cycle 
    - [ ] moon appears in different position based on time of month
    - [ ] Moon different shape based on time of month (full, half, crescent, etc)
        - This can be acheived with a light that is positioned based on date. Use the Earth in between to give the shadows.
- [ ] Accesibility
- [ ] Languages
    - [ ] Spanish
    - [ ] German
    - [ ] French
