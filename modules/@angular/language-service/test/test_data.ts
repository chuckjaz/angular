import {MockData} from './test_utils';

export const toh = {
  'app': {
    'app.component.ts': `import { Component } from '@angular/core';
import { RouteConfig, ROUTER_DIRECTIVES, ROUTER_PROVIDERS } from '@angular/router-deprecated';

import { DashboardComponent }  from './dashboard.component';
import { HeroesComponent }     from './heroes.component';
import { HeroDetailComponent } from './hero-detail.component';
import { HeroService }         from './hero.service';

@Component({
  selector: 'my-app',

  template: \`~{empty}
    <~{start-tag}h~{start-tag-after-h}1~{start-tag-h1} ~{h1-after-space}>~{h1-content}{{title}}</~{end-tag-h1}h1>
    ~{after-h1}<nav>
      <a [rout~{a-attr-name}erLink]="~{a-attr-value}['Dashboard']">Dashboard</a>
      <a [routerLink]="['Heroes']">Heroes</a>
    </nav>
    &~{entity-amp}amp;
    <router-outlet ~{outlet-attrs}></router-outlet>
  \`,
  styleUrls: ['app/app.component.css'],
  directives: [ROUTER_DIRECTIVES],
  providers: [
    ROUTER_PROVIDERS,
    HeroService,
  ]
})
@RouteConfig([
  { path: '/dashboard',  name: 'Dashboard',  component: DashboardComponent, useAsDefault: true },
  { path: '/detail/:id', name: 'HeroDetail', component: HeroDetailComponent },
  { path: '/heroes',     name: 'Heroes',     component: HeroesComponent }
])
export class AppComponent {
  title = 'Tour of Heroes';
}
`,
    'dashboard.component.ts': `import { Component, OnInit } from '@angular/core';
import { Router }           from '@angular/router-deprecated';

import { Hero }        from './hero';
import { HeroService } from './hero.service';

@Component({
  selector: 'my-dashboard',
  templateUrl: 'app/dashboard.component.html',
  styleUrls: ['app/dashboard.component.css']
})
export class DashboardComponent implements OnInit {

  heroes: Hero[] = [];

  constructor(
    private router: Router,
    private heroService: HeroService) {
  }

  ngOnInit() {
    this.heroService.getHeroes()
      .then(heroes => this.heroes = heroes.slice(1,5));
  }

  gotoDetail(hero: Hero) {
    let link = ['HeroDetail', { id: hero.id }];
    this.router.navigate(link);
  }
}`,
    'hero.ts': `export class Hero {
  id: number;
  name: string;
}`,
    'hero-detail.component.ts': `// #docplaster
// #docregion
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { RouteParams } from '@angular/router-deprecated';

import { Hero }        from './hero';
import { HeroService } from './hero.service';

@Component({
  selector: 'my-hero-detail',
  templateUrl: 'app/hero-detail.component.html',
  styleUrls: ['app/hero-detail.component.css']
})
export class HeroDetailComponent implements OnInit {
  @Input() hero: Hero;
  @Output() close = new EventEmitter();
  error: any;
  navigated = false; // true if navigated here

  constructor(
    private heroService: HeroService,
    private routeParams: RouteParams) {
  }

  // #docregion ngOnInit
  ngOnInit() {
    if (this.routeParams.get('id') !== null) {
      let id = +this.routeParams.get('id');
      this.navigated = true;
      this.heroService.getHero(id)
          .then(hero => this.hero = hero);
    } else {
      this.navigated = false;
      this.hero = new Hero();
    }
  }
  // #enddocregion ngOnInit
  // #docregion save
  save() {
    this.heroService
        .save(this.hero)
        .then(hero => {
          this.hero = hero; // saved hero, w/ id if new
          this.goBack(hero);
        })
        .catch(error => this.error = error); // TODO: Display error message
  }
  // #enddocregion save
  // #docregion goback
  goBack(savedHero: Hero = null) {
    this.close.emit(savedHero);
    if (this.navigated) { window.history.back(); }
  }
  // #enddocregion goback
}`,
    'hero.service.ts': `// #docplaster
// #docregion
import { Injectable }    from '@angular/core';
import { Headers, Http } from '@angular/http';

// #docregion rxjs
import 'rxjs/add/operator/toPromise';
// #enddocregion rxjs

import { Hero } from './hero';

@Injectable()
export class HeroService {

  private heroesUrl = 'app/heroes';  // URL to web api

  constructor(private http: Http) { }

  // #docregion get-heroes
  getHeroes(): Promise<Hero[]> {
    return this.http.get(this.heroesUrl)
    // #docregion to-promise
               .toPromise()
    // #enddocregion to-promise
    // #docregion to-data
               .then(response => response.json().data)
    // #enddocregion to-data
    // #docregion catch
               .catch(this.handleError);
    // #enddocregion catch
  }
  // #enddocregion get-heroes

  getHero(id: number) {
    return this.getHeroes()
               .then(heroes => heroes.filter(hero => hero.id === id)[0]);
  }

  // #docregion save
  save(hero: Hero): Promise<Hero>  {
    if (hero.id) {
      return this.put(hero);
    }
    return this.post(hero);
  }
  // #enddocregion save

  // #docregion delete-hero
  delete(hero: Hero) {
    let headers = new Headers();
    headers.append('Content-Type', 'application/json');

    let url = \`\${this.heroesUrl}/\${hero.id}\`;

    return this.http
               .delete(url, headers)
               .toPromise()
               .catch(this.handleError);
  }
  // #enddocregion delete-hero

  // #docregion post-hero
  // Add new Hero
  private post(hero: Hero): Promise<Hero> {
    let headers = new Headers({
      'Content-Type': 'application/json'});

    return this.http
               .post(this.heroesUrl, JSON.stringify(hero), {headers: headers})
               .toPromise()
               .then(res => res.json().data)
               .catch(this.handleError);
  }
  // #enddocregion post-hero

  // #docregion put-hero
  // Update existing Hero
  private put(hero: Hero) {
    let headers = new Headers();
    headers.append('Content-Type', 'application/json');

    let url = \`\${this.heroesUrl}/\${hero.id}\`;

    return this.http
               .put(url, JSON.stringify(hero), {headers: headers})
               .toPromise()
               .then(() => hero)
               .catch(this.handleError);
  }
  // #enddocregion put-hero

  // #docregion error-handler
  private handleError(error: any) {
    console.error('An error occurred', error);
    return Promise.reject(error.message || error);
  }
  // #enddocregion error-handler
}
// #enddocregion
`,
    'heroes.component.ts': `// #docregion
import { Component, OnInit } from '@angular/core';
import { Router }            from '@angular/router-deprecated';

import { Hero }                from './hero';
import { HeroService }         from './hero.service';
// #docregion hero-detail-component
import { HeroDetailComponent } from './hero-detail.component';

@Component({
  selector: 'my-heroes',
  templateUrl: 'app/heroes.component.html',
  styleUrls:  ['app/heroes.component.css'],
  directives: [HeroDetailComponent]
})
// #enddocregion hero-detail-component
export class HeroesComponent implements OnInit {
  heroes: Hero[];
  selectedHero: Hero;
  addingHero = false;
  error: any;

  constructor(
    private router: Router,
    private heroService: HeroService) { }

  getHeroes() {
    this.heroService
        .getHeroes()
        .then(heroes => this.heroes = heroes)
        .catch(error => this.error = error); // TODO: Display error message
  }

  // #docregion add
  addHero() {
    this.addingHero = true;
    this.selectedHero = null;
  }

  close(savedHero: Hero) {
    this.addingHero = false;
    if (savedHero) { this.getHeroes(); }
  }
  // #enddocregion add

  // #docregion delete
  delete(hero: Hero, event: any) {
    event.stopPropagation();
    this.heroService
        .delete(hero)
        .then(res => {
          this.heroes = this.heroes.filter(h => h !== hero);
          if (this.selectedHero === hero) { this.selectedHero = null; }
        })
        .catch(error => this.error = error); // TODO: Display error message
  }
  // #enddocregion delete

  ngOnInit() {
    this.getHeroes();
  }

  onSelect(hero: Hero) {
    this.selectedHero = hero;
    this.addingHero = false;
  }

  gotoDetail() {
    this.router.navigate(['HeroDetail', { id: this.selectedHero.id }]);
  }
}`,
    'in-memory-data.service.ts': `// #docregion
export class InMemoryDataService {
  createDb() {
    let heroes = [
      {id: 11, name: 'Mr. Nice'},
      {id: 12, name: 'Narco'},
      {id: 13, name: 'Bombasto'},
      {id: 14, name: 'Celeritas'},
      {id: 15, name: 'Magneta'},
      {id: 16, name: 'RubberMan'},
      {id: 17, name: 'Dynama'},
      {id: 18, name: 'Dr IQ'},
      {id: 19, name: 'Magma'},
      {id: 20, name: 'Tornado'}
    ];
    return {heroes};
  }
}`,
    'main.ts': `// #docplaster
// #docregion final
// Imports for loading & configuring the in-memory web api
import { provide }    from '@angular/core';
import { XHRBackend } from '@angular/http';

import { InMemoryBackendService, SEED_DATA } from './in-memory-backend.service';
import { InMemoryDataService }               from './in-memory-data.service';

// The usual bootstrapping imports
// #docregion v1
import { bootstrap }      from '@angular/platform-browser';
import { HTTP_PROVIDERS } from '@angular/http';

import { AppComponent }   from './app.component';

// #enddocregion v1, final
/*
// #docregion v1
bootstrap(AppComponent, [ HTTP_PROVIDERS ]);
// #enddocregion v1
 */
// #docregion final
bootstrap(AppComponent, [
    HTTP_PROVIDERS,
    provide(XHRBackend, { useClass: InMemoryBackendService }), // in-mem server
    provide(SEED_DATA,  { useClass: InMemoryDataService })     // in-mem server data
]);
// #enddocregion final`,
    'in-memory-backend.service.d.ts': `import { OpaqueToken } from '@angular/core';
import { Headers, Request, Response, ResponseOptions } from '@angular/http';
import { Observable } from 'rxjs/Observable';
import 'rxjs/add/operator/delay';
/**
* Seed data for in-memory database
* Must implement InMemoryDbService.
*/
export declare const SEED_DATA: OpaqueToken;
/**
* Interface for a class that creates an in-memory database
* Safe for consuming service to morph arrays and objects.
*/
export interface InMemoryDbService {
    /**
    * Creates "database" object hash whose keys are collection names
    * and whose values are arrays of the collection objects.
    *
    * It must be safe to call again and should return new arrays with new objects.
    * This condition allows InMemoryBackendService to morph the arrays and objects
    * without touching the original source data.
    */
    createDb(): {};
}
/**
* Interface for InMemoryBackend configuration options
*/
export interface InMemoryBackendConfigArgs {
    /**
     * default response options
     */
    defaultResponseOptions?: ResponseOptions;
    /**
     * delay (in ms) to simulate latency
     */
    delay?: number;
    /**
     * false (default) if ok when object-to-delete not found; else 404
     */
    delete404?: boolean;
    /**
     * host for this service
     */
    host?: string;
    /**
     * root path before any API call
     */
    rootPath?: string;
}
/**
*  InMemoryBackendService configuration options
*  Usage:
*    provide(InMemoryBackendConfig, {useValue: {delay:600}}),
*/
export declare class InMemoryBackendConfig implements InMemoryBackendConfigArgs {
    constructor(config?: InMemoryBackendConfigArgs);
}
/**
* Interface for object w/ info about the current request url
* extracted from an Http Request
*/
export interface ReqInfo {
    req: Request;
    base: string;
    collection: any[];
    collectionName: string;
    headers: Headers;
    id: any;
    resourceUrl: string;
}
export declare const isSuccess: (status: number) => boolean;
/**
 * Simulate the behavior of a RESTy web api
 * backed by the simple in-memory data store provided by the injected InMemoryDataService service.
 * Conforms mostly to behavior described here:
 * http://www.restapitutorial.com/lessons/httpmethods.html
 *
 * ### Usage
 *
 * Create InMemoryDataService class the implements IInMemoryDataService.
 * Register both this service and the seed data as in:
 * \`\`\`
 * // other imports
 * import { HTTP_PROVIDERS, XHRBackend } from 'angular2/http';
 * import { InMemoryBackendConfig, InMemoryBackendService, SEED_DATA } from '../in-memory-backend/in-memory-backend.service';
 * import { InMemoryStoryService } from '../api/in-memory-story.service';
 *
 * @Component({
 *   selector: ...,
 *   templateUrl: ...,
 *   providers: [
 *     HTTP_PROVIDERS,
 *     provide(XHRBackend, { useClass: InMemoryBackendService }),
 *     provide(SEED_DATA, { useClass: InMemoryStoryService }),
 *     provide(InMemoryBackendConfig, { useValue: { delay: 600 } }),
 *   ]
 * })
 * export class AppComponent { ... }
 * \`\`\`
 */
export declare class InMemoryBackendService {
    private _seedData;
    protected _config: InMemoryBackendConfigArgs;
    protected _db: {};
    constructor(_seedData: InMemoryDbService, config: InMemoryBackendConfigArgs);
    createConnection(req: Request): {
        response: Observable<{}>;
    };
    /**
     * Process Request and return an Http Response object
     * in the manner of a RESTy web api.
     *
     * Expect URI pattern in the form :base/:collectionName/:id?
     * Examples:
     *   api/characters
     *   api/characters/42
     *   api/characters.json/42   // ignores the ".json"
     *   commands/resetDb  // resets the "database"
     */
    protected _handleRequest(req: Request): Response;
    protected _clone(data: any): any;
    /**
     * When the \`base\`="commands", the \`collectionName\` is the command
     * Example URLs:
     *   commands/resetdb   // Reset the "database" to its original state
     *   commands/config (GET) // Return this service's config object
     *   commands/config (!GET) // Update the config (e.g. delay)
     *
     * Usage:
     *   http.post('commands/resetdb', null);
     *   http.get('commands/config');
     *   http.post('commands/config', '{"delay":1000}');
     */
    protected _commands(reqInfo: ReqInfo): ResponseOptions;
    protected _createErrorResponse(status: number, message: string): ResponseOptions;
    protected _delete({id, collection, collectionName, headers}: ReqInfo): ResponseOptions;
    protected _findById(collection: any[], id: number): any;
    protected _genId(collection: any): any;
    protected _get({id, collection, collectionName, headers}: ReqInfo): ResponseOptions;
    protected _getLocation(href: string): HTMLAnchorElement;
    protected _indexOf(collection: any[], id: number): number;
    protected _parseId(id: string): any;
    protected _parseUrl(url: string): {
        base: string;
        id: string;
        collectionName: string;
        resourceUrl: string;
    };
    protected _post({collection, headers, id, req, resourceUrl}: ReqInfo): ResponseOptions;
    protected _put({id, collection, collectionName, headers, req}: ReqInfo): ResponseOptions;
    protected _removeById(collection: any[], id: number): boolean;
    /**
     * Reset the "database" to its original state
     */
    protected _resetDb(): void;
    protected _setStatusText(options: ResponseOptions): ResponseOptions;
}`,
    'platform.ts': `
import {Component} from '@angular/core';
import {CORE_DIRECTIVES} from '@angular/common';

@Component({directives: CORE_DIRECTIVES})
class Platform {}
  `
  },
}
